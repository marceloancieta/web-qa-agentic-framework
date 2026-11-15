#!/usr/bin/env node
/**
 * `npm run ci:spree -- [playwright options]`: the Spree pack's run on a CI agent (FUT-01).
 *
 * A CI agent starts an empty Spree, so its admin can be anyone the run decides. This script fills
 * the admin actor's variables when the environment has none (`runEnv` of spree-up: the placeholder
 * address and a password generated for this run, held in memory only), starts Spree and makes that
 * admin (`spree-up.mjs`), and runs the pack's specs with the same variables. Nothing is stored as a
 * secret, written to disk or printed; the run's redaction knows the password because the admin
 * actor's account carries it. A value the environment already has (a local `.env`) is kept.
 *
 * Exit codes: 2 the configuration is missing; otherwise spree-up's code when it failed, then the
 * code of the Playwright run.
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/cli.mjs';
import { loadLocalEnv } from './lib/env.mjs';
import { packEntry } from './lib/qa-config.mjs';
import { exitCodeOf, spawnFailure } from './lib/spawn.mjs';
import { PACK, runEnv } from './spree-up.mjs';

/** The Playwright arguments of the pack's run: its projects, then what the caller passed. */
export function playwrightArgs(extra) {
  return ['test', `--project=${PACK}-*`, ...extra];
}

function run(label, args, env) {
  const result = spawnSync(process.execPath, args, { cwd: REPO_ROOT, env, stdio: 'inherit' });
  const failure = spawnFailure(result);
  if (failure) console.error(`ci-spree: ${label} ${failure}`);
  return exitCodeOf(result);
}

function main() {
  loadLocalEnv();
  let env;
  let filled;
  try {
    const { entry } = packEntry(PACK, REPO_ROOT);
    ({ env, filled } = runEnv(process.env, entry));
  } catch (error) {
    console.error(`ci-spree: ${error.message}`);
    return 2;
  }
  if (filled.length > 0) console.log(`ci-spree: set for this run only: ${filled.join(', ')}`);
  const up = run('spree-up', [join(REPO_ROOT, 'scripts', 'spree-up.mjs')], env);
  if (up !== 0) return up;
  const cli = join(REPO_ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
  return run('playwright', [cli, ...playwrightArgs(process.argv.slice(2))], env);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main();
