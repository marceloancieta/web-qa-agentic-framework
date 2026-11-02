// The checks before a release tag (DOC-03), on temporary repositories with a bare remote; the gates
// are a spy, so a test also proves which checks ran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitEnv } from '../lib/git.mjs';
import { CHECKS, machineIo, releaseCheck } from '../release-check.mjs';

function git(dir, ...args) {
  const run = spawnSync(
    'git',
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args],
    { cwd: dir, env: gitEnv(), encoding: 'utf8' },
  );
  assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`);
  return run.stdout.trim();
}

const CHANGELOG = (version) =>
  `# Changelog\n\n## [${version}] - 2026-11-02\n\n### Features\n\n- x\n`;

/** A clone of a bare remote, on main, with package.json at `version` and its changelog section. */
function releaseRepo({ version = '0.1.0', changelog = version } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'release-'));
  const remote = join(base, 'remote.git');
  git(base, 'init', '-q', '--bare', '--initial-branch=main', remote);
  const clone = join(base, 'clone');
  git(base, 'clone', '-q', remote, clone);
  git(clone, 'checkout', '-q', '-B', 'main');
  writeFileSync(join(clone, 'package.json'), `${JSON.stringify({ name: 'x', version })}\n`);
  writeFileSync(join(clone, 'CHANGELOG.md'), CHANGELOG(changelog));
  git(clone, 'add', '-A');
  git(clone, 'commit', '-qm', 'release');
  git(clone, 'push', '-q', 'origin', 'main');
  return { base, remote, clone };
}

/** The machine io of `clone` with the gates replaced by a spy that answers `code`. */
function io(clone, code = 0) {
  const calls = [];
  return {
    ...machineIo(clone),
    gates: () => {
      calls.push('gates');
      return { status: code };
    },
    calls,
  };
}

test('every check passes in order on a clean, current main with the version everywhere', () => {
  const { clone } = releaseRepo();
  const spy = io(clone);
  const { code, lines } = releaseCheck({ version: '0.1.0', io: spy });
  assert.equal(code, 0, lines.join('\n'));
  assert.deepEqual(
    lines.slice(0, CHECKS.length),
    CHECKS.map((name) => `ok   ${name}`),
  );
  assert.match(
    lines.at(-1),
    /v0\.1\.0 is ready to tag; the tag and any publishing are the owner's/,
  );
  assert.deepEqual(spy.calls, ['gates']);
});

test('a dirty tree stops the checks before anything else runs', () => {
  const { clone } = releaseRepo();
  writeFileSync(join(clone, 'notes.txt'), 'draft\n');
  const spy = io(clone);
  const { code, lines } = releaseCheck({ version: '0.1.0', io: spy });
  assert.equal(code, 1);
  assert.deepEqual(lines, [
    'FAIL clean tree: the working tree has changes; commit or stash them',
    'not run: main up to date, gates, changelog section, version',
  ]);
  assert.deepEqual(spy.calls, []);
});

test('the release is checked on main, equal to origin/main', () => {
  const { base, remote, clone } = releaseRepo();
  git(clone, 'checkout', '-q', '-b', 'feature');
  assert.match(
    releaseCheck({ version: '0.1.0', io: io(clone) }).lines[1],
    /^FAIL main up to date: the release is tagged on main, and this is feature$/,
  );
  git(clone, 'checkout', '-q', 'main');
  // Someone else pushed to main after this clone last fetched.
  const other = join(base, 'other');
  git(base, 'clone', '-q', remote, other);
  writeFileSync(join(other, 'later.txt'), 'later\n');
  git(other, 'add', '-A');
  git(other, 'commit', '-qm', 'later');
  git(other, 'push', '-q', 'origin', 'main');
  const spy = io(clone);
  const behind = releaseCheck({ version: '0.1.0', io: spy });
  assert.equal(behind.code, 1);
  assert.match(
    behind.lines[1],
    /^FAIL main up to date: main \(\w{7}\) differs from origin\/main \(\w{7}\); pull or push first$/,
  );
  assert.deepEqual(spy.calls, []);
});

test('failing gates stop the checks before the changelog and the version', () => {
  const { clone } = releaseRepo({ changelog: '0.0.9' });
  const { code, lines } = releaseCheck({ version: '0.1.0', io: io(clone, 1) });
  assert.equal(code, 1);
  assert.deepEqual(lines.slice(2), [
    'FAIL gates: npm run gates failed (exit 1)',
    'not run: changelog section, version',
  ]);
});

test('the changelog must open with the version', () => {
  const { clone } = releaseRepo({ changelog: '0.0.9' });
  assert.equal(
    releaseCheck({ version: '0.1.0', io: io(clone) }).lines[3],
    "FAIL changelog section: CHANGELOG.md's latest section is 0.0.9, not 0.1.0; run npm run changelog:write",
  );
});

test('the version is in package.json, not tagged yet, and later than the latest tag', () => {
  const stale = releaseRepo({ version: '0.0.0', changelog: '0.1.0' });
  assert.equal(
    releaseCheck({ version: '0.1.0', io: io(stale.clone) }).lines[4],
    'FAIL version: package.json says 0.0.0, not 0.1.0; set it in the release commit',
  );
  const tagged = releaseRepo();
  git(tagged.clone, 'tag', 'v0.1.0');
  assert.equal(
    releaseCheck({ version: '0.1.0', io: io(tagged.clone) }).lines[4],
    'FAIL version: the tag v0.1.0 already exists',
  );
  const older = releaseRepo();
  git(older.clone, 'tag', 'v0.2.0');
  assert.equal(
    releaseCheck({ version: '0.1.0', io: io(older.clone) }).lines[4],
    'FAIL version: 0.1.0 is not later than v0.2.0, the latest version tag',
  );
});

test('a version that is not X.Y.Z is a usage error, and nothing runs', () => {
  const spy = io(releaseRepo().clone);
  for (const version of [undefined, 'v0.1.0', '0.1', '0.1.0-rc.1'])
    assert.equal(releaseCheck({ version, io: spy }).code, 2, String(version));
  assert.deepEqual(spy.calls, []);
});
