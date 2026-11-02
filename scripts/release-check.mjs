#!/usr/bin/env node
/**
 * `npm run release:check -- [--version X.Y.Z]`: the checks before a release tag, in order, stopping
 * at the first that fails (DOC-03). Each failure says what to do; nothing is tagged or published
 * here, that stays with the owner.
 *
 *   1. clean tree         no uncommitted or untracked change
 *   2. main up to date    on `main`, and equal to `origin/main` after a fetch
 *   3. gates              `npm run gates` passes
 *   4. changelog section  CHANGELOG.md's latest section is the version (`npm run changelog:write`)
 *   5. version            package.json has the version, its `vX.Y.Z` tag does not exist yet, and
 *                         it is later than the latest version tag
 *
 * The version is `--version`, or package.json's when it is not given. Exit codes: 0 every check
 * passed; 1 a check failed; 2 usage error.
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { latestRelease, latestVersionTag, parseVersion } from './changelog.mjs';
import { readTextIfExists, REPO_ROOT } from './lib/cli.mjs';
import { gitEnv } from './lib/git.mjs';
import { describeExit, exitCodeOf } from './lib/spawn.mjs';

export const RELEASE_BRANCH = 'main';
export const CHECKS = ['clean tree', 'main up to date', 'gates', 'changelog section', 'version'];

/** What touches the machine: git, the gates and files, replaced in the tests. */
export function machineIo(root = REPO_ROOT) {
  return {
    git: (args) => spawnSync('git', args, { cwd: root, env: gitEnv(), encoding: 'utf8' }),
    // A fixed command through the shell, as lanes.mjs does, so `npm` resolves to npm.cmd on Windows.
    gates: () => spawnSync('npm run gates', { cwd: root, stdio: 'inherit', shell: true }),
    read: (file) => readTextIfExists(join(root, file)),
  };
}

const later = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** One check by name: `null` when it passes, otherwise why it failed and what to do. */
export function runCheck(name, { version, io }) {
  const git = (...args) => {
    const run = io.git(args);
    return {
      ok: exitCodeOf(run) === 0,
      out: (run.stdout ?? '').trim(),
      err: (run.stderr ?? '').trim(),
    };
  };
  switch (name) {
    case 'clean tree': {
      const status = git('status', '--porcelain');
      if (!status.ok) return `git status failed: ${status.err}`;
      return status.out ? 'the working tree has changes; commit or stash them' : null;
    }
    case 'main up to date': {
      const branch = git('rev-parse', '--abbrev-ref', 'HEAD').out;
      if (branch !== RELEASE_BRANCH)
        return `the release is tagged on ${RELEASE_BRANCH}, and this is ${branch || 'no branch'}`;
      const fetch = git('fetch', '--quiet', 'origin', RELEASE_BRANCH);
      if (!fetch.ok) return `cannot fetch origin/${RELEASE_BRANCH}: ${fetch.err}`;
      const local = git('rev-parse', 'HEAD').out;
      const remote = git('rev-parse', `origin/${RELEASE_BRANCH}`).out;
      return local === remote
        ? null
        : `${RELEASE_BRANCH} (${local.slice(0, 7)}) differs from origin/${RELEASE_BRANCH} (${remote.slice(0, 7)}); pull or push first`;
    }
    case 'gates': {
      const run = io.gates();
      return exitCodeOf(run) === 0 ? null : `npm run gates failed (${describeExit(run)})`;
    }
    case 'changelog section': {
      const latest = latestRelease(io.read('CHANGELOG.md'));
      if (latest === version) return null;
      return latest
        ? `CHANGELOG.md's latest section is ${latest}, not ${version}; run npm run changelog:write`
        : `CHANGELOG.md has no section for ${version}; run npm run changelog:write`;
    }
    case 'version': {
      const manifest = JSON.parse(io.read('package.json') ?? '{}');
      if (manifest.version !== version)
        return `package.json says ${manifest.version ?? 'no version'}, not ${version}; set it in the release commit`;
      const tags = git('tag', '--list', 'v*').out.split('\n').filter(Boolean);
      if (tags.includes(`v${version}`)) return `the tag v${version} already exists`;
      const latest = latestVersionTag(tags);
      if (latest && later(parseVersion(version), parseVersion(latest)) <= 0)
        return `${version} is not later than ${latest}, the latest version tag`;
      return null;
    }
    default:
      throw new Error(`unknown check "${name}"`);
  }
}

/** Run the checks in order, stopping at the first failure: `{ code, lines }`. */
export function releaseCheck({ version, io }) {
  if (!parseVersion(version) || !/^\d+\.\d+\.\d+$/.test(version))
    return { code: 2, lines: [`the version must be X.Y.Z, got "${version ?? ''}"`] };
  const lines = [];
  for (const name of CHECKS) {
    const failure = runCheck(name, { version, io });
    if (failure) {
      lines.push(`FAIL ${name}: ${failure}`);
      const left = CHECKS.slice(CHECKS.indexOf(name) + 1);
      if (left.length) lines.push(`not run: ${left.join(', ')}`);
      return { code: 1, lines };
    }
    lines.push(`ok   ${name}`);
  }
  lines.push(`v${version} is ready to tag; the tag and any publishing are the owner's to make.`);
  return { code: 0, lines };
}

function main() {
  let values;
  try {
    ({ values } = parseArgs({ options: { version: { type: 'string' } } }));
  } catch (error) {
    console.error(`release-check: ${error.message}`);
    process.exit(2);
  }
  const io = machineIo();
  const version = values.version ?? JSON.parse(io.read('package.json') ?? '{}').version;
  const { code, lines } = releaseCheck({ version, io });
  for (const line of lines) (code === 0 ? console.log : console.error)(`release-check: ${line}`);
  process.exitCode = code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
