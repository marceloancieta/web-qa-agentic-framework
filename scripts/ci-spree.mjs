#!/usr/bin/env node
/**
 * `npm run ci:spree -- [--lane <lane>] [playwright options]`: the Spree pack's run on a CI agent
 * (FUT-01), or one lane of it (SP-01).
 *
 * A CI agent starts an empty Spree, so its admin can be anyone the run decides. This script fills
 * the admin actor's variables when the environment has none (`runEnv` of spree-up: the placeholder
 * address and a password generated for this run, held in memory only), starts Spree and makes that
 * admin (`spree-up.mjs`), and runs the pack's specs with the same variables. Nothing is stored as a
 * secret, written to disk or printed; the run's redaction knows the password because the admin
 * actor's account carries it. A value the environment already has (a local `.env`) is kept.
 *
 * With `--lane <lane>` first, the run is that lane of `scripts/lanes.mjs` over the pack's projects,
 * such as the accessibility sweep. Its JSON report defaults to `reports/lanes/<lane>-spree.json`, so
 * the same lane run over the other packs in the same job keeps its own report; QA_JSON_REPORT, when
 * set, still decides. A second call on a running Spree keeps its data: spree-up only sets the
 * admin's password to the one this run holds.
 *
 * `--lane visual` runs the visual lane (`scripts/visual-lane.mjs`) in the pinned container (SP-02),
 * as `npm run lanes:visual` does, with three differences: the container reaches Spree on the compose
 * network (`CONTAINER_BASE_URL`), since a Linux agent publishes its port on 127.0.0.1 only; the
 * admin's variables and the report's path reach the container by name (`docker compose run -e NAME`
 * passes this process's value, so no value is written into a command line or a file); and the
 * report is reports/lanes/visual-spree.json.
 *
 * Exit codes: 2 the configuration or the arguments are wrong; otherwise spree-up's code when it
 * failed, then the code of the Playwright run or the lane.
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/cli.mjs';
import { loadLocalEnv } from './lib/env.mjs';
import { packEntry, packVariable } from './lib/qa-config.mjs';
import { exitCodeOf, spawnFailure } from './lib/spawn.mjs';
import { PACK, SERVICE, adminVariables, runEnv } from './spree-up.mjs';

/** Where the container lanes reach Spree: its compose service, on the port it listens on. */
export const CONTAINER_BASE_URL = `http://${SERVICE}:3000`;

/** The Playwright arguments of the pack's run: its projects, then what the caller passed. */
export function playwrightArgs(extra) {
  return ['test', `--project=${PACK}-*`, ...extra];
}

/**
 * What the caller's arguments run: `{ lane: null, args }` for the pack's specs, `{ lane, args,
 * report }` for a lane named by a leading `--lane <lane>` or `--lane=<lane>`, or `{ refusal }`.
 * `args` are the arguments of `scripts/lanes.mjs` or of Playwright, and `report` the lane's
 * default JSON report.
 */
export function runPlan(args) {
  const isLane = (arg) => arg === '--lane' || arg.startsWith('--lane=');
  const [first = '', ...rest] = args;
  if (!isLane(first)) {
    if (args.some(isLane)) return { refusal: '--lane must come first.' };
    return { lane: null, args: playwrightArgs(args) };
  }
  const lane = first === '--lane' ? (rest.shift() ?? '') : first.slice('--lane='.length);
  if (!/^[a-z][a-z0-9-]*$/.test(lane))
    return { refusal: `--lane needs a lane name, got "${lane}".` };
  return {
    lane,
    args: [lane, `--project=${PACK}-*`, ...rest],
    // Forward slashes on every host: the visual lane reads it inside a Linux container.
    report: `reports/lanes/${lane}-${PACK}.json`,
  };
}

/**
 * The `docker` arguments of the visual lane over the pack's projects: the lane's container, with
 * each of `variables` passed by name from this process's environment, then `extra`.
 */
export function visualLaneArgs(variables, extra) {
  return [
    'compose',
    '-f',
    join('docker', 'compose.yml'),
    'run',
    '--rm',
    ...variables.flatMap((name) => ['-e', name]),
    'playwright',
    'node',
    'scripts/visual-lane.mjs',
    `--project=${PACK}-*`,
    ...extra,
  ];
}

function run(label, args, env, command = process.execPath) {
  const result = spawnSync(command, args, { cwd: REPO_ROOT, env, stdio: 'inherit' });
  const failure = spawnFailure(result);
  if (failure) console.error(`ci-spree: ${label} ${failure}`);
  return exitCodeOf(result);
}

function main() {
  const plan = runPlan(process.argv.slice(2));
  if (plan.refusal) {
    console.error(`ci-spree: refused: ${plan.refusal}`);
    return 2;
  }
  loadLocalEnv();
  let env;
  let filled;
  let admin;
  try {
    const { entry } = packEntry(PACK, REPO_ROOT);
    ({ env, filled } = runEnv(process.env, entry));
    admin = adminVariables(entry);
  } catch (error) {
    console.error(`ci-spree: ${error.message}`);
    return 2;
  }
  if (filled.length > 0) console.log(`ci-spree: set for this run only: ${filled.join(', ')}`);
  const up = run('spree-up', [join(REPO_ROOT, 'scripts', 'spree-up.mjs')], env);
  if (up !== 0) return up;
  if (plan.lane === 'visual') {
    const baseUrl = packVariable(PACK, 'BASE_URL');
    const variables = [admin.email, admin.password, baseUrl, 'QA_JSON_REPORT'];
    return run(
      'lane visual',
      visualLaneArgs(variables, plan.args.slice(2)),
      {
        ...env,
        [baseUrl]: CONTAINER_BASE_URL,
        QA_JSON_REPORT: env.QA_JSON_REPORT || plan.report,
      },
      'docker',
    );
  }
  if (plan.lane) {
    const lanes = join(REPO_ROOT, 'scripts', 'lanes.mjs');
    return run(`lane ${plan.lane}`, [lanes, ...plan.args], {
      ...env,
      QA_JSON_REPORT: env.QA_JSON_REPORT || plan.report,
    });
  }
  const cli = join(REPO_ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
  return run('playwright', [cli, ...plan.args], env);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main();
