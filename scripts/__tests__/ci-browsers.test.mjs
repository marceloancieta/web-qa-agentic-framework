// The apt cache only saves time: whatever happens to it, the install runs, and its exit code is the
// script's.
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APT_ARCHIVES,
  APT_LIMITS,
  APT_LIMITS_TARGET,
  INSTALL_ARGS,
  installBrowsers,
  packagesIn,
} from '../ci-browsers.mjs';

const CACHE = '/home/runner/.cache/qa-apt-packages';
const ok = { status: 0 };

/** An `io` that records what the script did. `folders` maps a folder to the names it holds. */
function machine({ folders = {}, install = ok, sudo = ok, copy } = {}) {
  const calls = [];
  const errors = [];
  return {
    calls,
    errors,
    out: { log: () => {}, error: (line) => errors.push(line) },
    install: () => {
      calls.push('install');
      return install;
    },
    sudo: (args) => {
      calls.push(`sudo ${args[0]} ${args.length - 3}`);
      return sudo;
    },
    list: (folder) => folders[folder] ?? [],
    copy: (from, to) => {
      if (copy) copy();
      calls.push(`copy ${from} ${to}`);
    },
    makeFolder: (folder) => calls.push(`mkdir ${folder}`),
  };
}

test('the install covers the three engines with their system packages', () => {
  assert.deepEqual(INSTALL_ARGS, ['install', '--with-deps', 'chromium', 'firefox', 'webkit']);
});

test('only package files count; the lock and the partial folder of apt do not', () => {
  assert.deepEqual(packagesIn(['a_1_amd64.deb', 'lock', 'partial', 'b.deb.tmp']), [
    'a_1_amd64.deb',
  ]);
});

test('without the cache nothing is copied and no root command runs', () => {
  const io = machine({ folders: { [APT_ARCHIVES]: ['a.deb'] } });
  assert.equal(installBrowsers({ cache: null }, io), 0);
  assert.deepEqual(io.calls, ['install']);
});

test('cached packages reach apt before the install, and new ones are kept after it', () => {
  const io = machine({
    folders: { [CACHE]: ['a.deb'], [APT_ARCHIVES]: ['a.deb', 'b.deb', 'lock'] },
  });
  assert.equal(installBrowsers({ cache: CACHE }, io), 0);
  assert.equal(io.calls[1], 'sudo cp 1');
  assert.equal(io.calls[2], 'install');
  const copies = io.calls.filter((call) => call.startsWith('copy'));
  assert.equal(copies.length, 1, 'a package the cache holds is not copied again');
  assert.match(copies[0], /b\.deb/);
});

test('an empty cache copies no package and fills the cache after the install', () => {
  const io = machine({ folders: { [APT_ARCHIVES]: ['a.deb'] } });
  assert.equal(installBrowsers({ cache: CACHE }, io), 0);
  assert.deepEqual(io.calls.slice(0, 2), ['sudo cp 0', 'install']);
  assert.ok(io.calls.some((call) => call.startsWith('copy')));
});

test('apt gets its limits before anything else, in the folder it reads them from', () => {
  const copied = [];
  const io = machine({ folders: { [CACHE]: ['a.deb'] } });
  const { sudo } = io;
  io.sudo = (args) => {
    copied.push(args);
    return sudo(args);
  };
  assert.equal(installBrowsers({ cache: CACHE }, io), 0);
  assert.deepEqual(copied[0], ['cp', APT_LIMITS, APT_LIMITS_TARGET]);
  assert.equal(io.calls[0], 'sudo cp 0');
});

test('the limits are short, and name each protocol apt uses on a runner', () => {
  const limits = readFileSync(APT_LIMITS, 'utf8');
  for (const name of ['Acquire::http::Timeout', 'Acquire::https::Timeout']) {
    const seconds = Number(new RegExp(`^${name} "(\\d+)";$`, 'm').exec(limits)?.[1]);
    assert.ok(seconds > 0 && seconds <= 30, name);
  }
  assert.match(limits, /^Acquire::Retries "[1-5]";$/m);
});

test('a root command that fails is reported and the install still runs', () => {
  for (const sudo of [{ status: 1 }, { status: null, error: new Error('no sudo') }]) {
    const io = machine({ folders: { [CACHE]: ['a.deb'] }, sudo });
    assert.equal(installBrowsers({ cache: CACHE }, io), 0);
    assert.ok(io.calls.includes('install'));
    assert.match(io.errors[0], /setting the apt limits failed/);
    assert.match(io.errors[1], /restoring the apt packages failed/);
  }
});

test('a cache folder that cannot be read does not stop the install', () => {
  const io = machine();
  io.list = () => {
    throw new Error('denied');
  };
  assert.equal(installBrowsers({ cache: CACHE }, io), 0);
  assert.ok(io.calls.includes('install'));
  assert.equal(io.errors.length, 2);
});

test('a copy that fails after the install leaves the exit code at 0', () => {
  const io = machine({
    folders: { [APT_ARCHIVES]: ['a.deb'] },
    copy: () => {
      throw new Error('disk full');
    },
  });
  assert.equal(installBrowsers({ cache: CACHE }, io), 0);
  assert.match(io.errors[0], /keeping the apt packages failed/);
});

test('a failed install is the exit code, and nothing is kept from it', () => {
  const io = machine({ folders: { [APT_ARCHIVES]: ['a.deb'] }, install: { status: 3 } });
  assert.equal(installBrowsers({ cache: CACHE }, io), 3);
  assert.ok(!io.calls.some((call) => call.startsWith('copy')));
  assert.match(io.errors[0], /playwright install failed \(exit 3\)/);
});

test('an install killed by a signal counts as a failure', () => {
  const io = machine({ install: { status: null, signal: 'SIGTERM' } });
  assert.equal(installBrowsers({ cache: null }, io), 1);
});
