#!/usr/bin/env node
/**
 * Installs the browsers of every desktop engine with the system packages they need (CI-11).
 *
 *   npm run ci:browsers
 *
 * On Linux `--with-deps` installs those packages through apt. They are usually fetched in seconds,
 * but a runner that reaches the Ubuntu mirror slowly can spend more than half an hour on them. With
 * $QA_APT_CACHE set, as the CI jobs do, the packages a job's cache step restored to
 * `~/.cache/qa-apt-packages` are copied to apt's own folder before the install, and what apt then
 * holds is copied back for the cache step to save. apt takes a package from that folder only when
 * its version and checksum match what it would fetch, and fetches the rest, so an old cache costs a
 * download and never installs an old package.
 *
 * The cache only saves time: a copy that fails is reported and the install goes on as if it were
 * empty. Without $QA_APT_CACHE, on a person's machine or in Jenkins, nothing is copied.
 *
 * The exit code is the install's.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/cli.mjs';
import { describeExit, exitCodeOf } from './lib/spawn.mjs';

/** The folder the cache step of a job restores and saves, as that step names it. */
export const APT_CACHE_PATH = '~/.cache/qa-apt-packages';
/** Where apt keeps the packages it fetched and looks for them before fetching. */
export const APT_ARCHIVES = '/var/cache/apt/archives';

const PLAYWRIGHT_CLI = join(REPO_ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
export const INSTALL_ARGS = ['install', '--with-deps', 'chromium', 'firefox', 'webkit'];

/** The package files of a folder, by name; a folder that is missing holds none. */
export function packagesIn(names) {
  return names.filter((name) => name.endsWith('.deb'));
}

/** Copy the cached packages to apt's folder, which only root may write. Returns how many. */
function restore(cache, io) {
  const names = packagesIn(io.list(cache));
  if (names.length === 0) {
    io.out.log('ci-browsers: no cached apt packages; apt fetches them all.');
    return 0;
  }
  const copy = io.sudo(['cp', '-t', APT_ARCHIVES, ...names.map((name) => join(cache, name))]);
  if (exitCodeOf(copy) !== 0) {
    io.out.error(
      `ci-browsers: restoring the apt packages failed (${describeExit(copy)}); going on.`,
    );
    return 0;
  }
  io.out.log(`ci-browsers: ${names.length} cached apt package(s) restored.`);
  return names.length;
}

/** Copy what apt holds to the cache folder; apt's files can be read by anyone. Returns how many. */
function save(cache, io) {
  const names = packagesIn(io.list(APT_ARCHIVES));
  io.makeFolder(cache);
  const known = new Set(io.list(cache));
  const fresh = names.filter((name) => !known.has(name));
  for (const name of fresh) io.copy(join(APT_ARCHIVES, name), join(cache, name));
  io.out.log(
    `ci-browsers: ${fresh.length} new apt package(s) of ${names.length} kept for the cache.`,
  );
  return fresh.length;
}

/**
 * Install the browsers and return the exit code. `io` holds what touches the machine, replaced in
 * tests: `install()` and `sudo(args)` return a `spawnSync` result, `list(folder)` the names in a
 * folder, `copy(from, to)`, `makeFolder(folder)`, `out`.
 */
export function installBrowsers({ cache }, io) {
  if (cache) {
    try {
      restore(cache, io);
    } catch (error) {
      io.out.error(`ci-browsers: restoring the apt packages failed (${error.message}); going on.`);
    }
  }
  const install = io.install();
  const code = exitCodeOf(install);
  if (code !== 0) {
    io.out.error(`ci-browsers: playwright install failed (${describeExit(install)}).`);
    return code;
  }
  if (cache) {
    try {
      save(cache, io);
    } catch (error) {
      io.out.error(`ci-browsers: keeping the apt packages failed (${error.message}); going on.`);
    }
  }
  return 0;
}

function machineIo() {
  return {
    out: console,
    install: () =>
      spawnSync(process.execPath, [PLAYWRIGHT_CLI, ...INSTALL_ARGS], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
      }),
    sudo: (args) => spawnSync('sudo', args, { stdio: 'inherit' }),
    list: (folder) => (existsSync(folder) ? readdirSync(folder) : []),
    copy: (from, to) => copyFileSync(from, to),
    makeFolder: (folder) => mkdirSync(folder, { recursive: true }),
  };
}

function main() {
  const cache = process.env.QA_APT_CACHE
    ? join(homedir(), APT_CACHE_PATH.replace(/^~\//, ''))
    : null;
  process.exitCode = installBrowsers({ cache }, machineIo());
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
