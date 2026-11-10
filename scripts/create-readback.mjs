#!/usr/bin/env node
/**
 * `npm run create:readback -- --tag vX.Y.Z [--minutes N]`: reads a published `create-web-qa` back,
 * the last step of `.github/workflows/publish.yml` (FUT-12). The step before it stages the version
 * (CI-09), so it waits until the owner has approved it on npm and the registry shows it, then runs
 * `npm create web-qa@X.Y.Z` in an empty folder outside the repository and checks that the project
 * it made records that release.
 *
 * It runs after a good stage, and a re-run cannot stage the same version again, so a failure here
 * says how to approve the version and read it back by hand instead of re-running the job.
 *
 * Exit codes: 0 read back; 1 the registry did not show it in time, or the project was not made;
 * 2 usage error.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// The owner approves the staged version on npm with two-factor authentication while this waits.
export const DEFAULT_MINUTES = 30;
const POLL_MS = 30_000;
const RELEASE_TAG = /^v(\d+\.\d+\.\d+)$/;

/** What to do by hand when the read-back fails after the stage succeeded. */
export function byHand(version) {
  return (
    `create-web-qa@${version} was staged (the stage step succeeded), and a re-run cannot stage ` +
    `it again: do not re-run. If it is not approved yet, approve it on npm with two-factor ` +
    `authentication: the package's Staged Packages tab, or npm stage list create-web-qa and ` +
    `npm stage approve <stage-id>. Once npm view create-web-qa@${version} version prints ` +
    `${version}, read it back by hand in an empty folder outside the repository with ` +
    `npm create web-qa@${version} readback, check that readback/.web-qa.json names ` +
    `v${version}, and create the GitHub release (CONTRIBUTING, releasing).`
  );
}

/**
 * Wait for the registry to show `version`, then create a project from it: `{ code, lines }`.
 * `io` holds what touches the registry and the clock, replaced in the tests: `view(version)` the
 * version the registry shows or null, `create(version)` the release the new project records or
 * null, `now()` in milliseconds, and `sleep(ms)`.
 */
export async function readBack({ version, minutes = DEFAULT_MINUTES, io }) {
  const deadline = io.now() + minutes * 60_000;
  while (io.view(version) !== version) {
    if (io.now() >= deadline)
      return {
        code: 1,
        lines: [
          `The registry did not show create-web-qa@${version} within ${minutes} minutes. ${byHand(version)}`,
        ],
      };
    await io.sleep(POLL_MS);
  }
  const release = io.create(version);
  if (release !== `v${version}`)
    return {
      code: 1,
      lines: [
        `npm create web-qa@${version} did not make a project of v${version} (it recorded ${release ?? 'nothing'}). ${byHand(version)}`,
      ],
    };
  return {
    code: 0,
    lines: [
      `create-web-qa@${version} is on the registry, and npm create made a v${version} project.`,
    ],
  };
}

/**
 * The registry and the clock. The commands go through the shell, as lanes.mjs does, so `npm`
 * resolves to npm.cmd on Windows; the version in them is X.Y.Z, checked before they are built.
 * `npm create` runs in a new folder under the system's temporary folder, outside the repository,
 * with npm's install prompt answered.
 */
export function registryIo() {
  return {
    view: (version) => {
      const run = spawnSync(`npm view create-web-qa@${version} version`, {
        cwd: tmpdir(),
        encoding: 'utf8',
        shell: true,
      });
      return run.status === 0 ? run.stdout.trim() || null : null;
    },
    create: (version) => {
      const dir = mkdtempSync(join(tmpdir(), 'create-web-qa-readback-'));
      const run = spawnSync(`npm create web-qa@${version} readback`, {
        cwd: dir,
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, npm_config_yes: 'true' },
      });
      const record = join(dir, 'readback', '.web-qa.json');
      if (run.status !== 0 || !existsSync(record)) return null;
      return JSON.parse(readFileSync(record, 'utf8')).release ?? null;
    },
    now: () => Date.now(),
    sleep: (ms) => sleep(ms),
  };
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({ options: { tag: { type: 'string' }, minutes: { type: 'string' } } }));
  } catch (error) {
    console.error(`create-readback: ${error.message}`);
    return 2;
  }
  const version = RELEASE_TAG.exec(values.tag ?? '')?.[1];
  const minutes = Number(values.minutes ?? DEFAULT_MINUTES);
  if (!version || !Number.isInteger(minutes) || minutes < 1) {
    console.error('usage: npm run create:readback -- --tag vX.Y.Z [--minutes N]');
    return 2;
  }
  console.log(
    `create-readback: waiting up to ${minutes} minutes for create-web-qa@${version} to be approved on npm and shown by the registry.`,
  );
  const { code, lines } = await readBack({ version, minutes, io: registryIo() });
  for (const line of lines) (code === 0 ? console.log : console.error)(`create-readback: ${line}`);
  return code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await main();
