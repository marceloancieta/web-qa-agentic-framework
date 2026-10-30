#!/usr/bin/env node
/**
 * The visual lane: the `@visual` cases, inside the pinned Playwright image only (ADR 0009).
 *
 *   npm run lanes:visual -- [playwright options]           the run phase: compare with the baselines
 *   npm run lanes:visual -- --phase automate --update      the automate phase: write the baselines
 *
 * `npm run lanes:visual` starts the compose service `playwright`, which runs this script inside the
 * image. Run directly anywhere else, the script refuses and says why: a baseline rendered on a
 * developer's machine would differ from CI's by fonts and anti-aliasing alone.
 *
 * Updating baselines is design, not execution: `--update` is accepted only with `--phase automate`,
 * and Playwright's own `--update-snapshots` (`-u`) is refused in the run phase. Packs whose base URL
 * is a host address (`localhost`, `127.0.0.1`) are reached through `host.docker.internal`.
 *
 * Exit codes: Playwright's own; 2 refused (outside the image, a mismatched image, an update in the
 * run phase, a usage error).
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/cli.mjs';
import { containerUrl, imageProblem, inPinnedImage } from './lib/container.mjs';
import { activeEnvironment, packVariable } from './lib/qa-config.mjs';
import { exitCodeOf } from './lib/spawn.mjs';
import { VISUAL_LANE_ENV } from './lib/tags.mjs';

const UPDATE_FLAGS = new Set(['--update-snapshots', '-u']);

/** The lane's plan from its arguments: `{ phase, update, forwarded }`, or `{ refusal }`. */
export function planLane(args) {
  let phase = 'run';
  let update = false;
  const forwarded = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--phase') phase = args[++i] ?? '';
    else if (arg === '--update') update = true;
    else forwarded.push(arg);
  }
  if (!['run', 'automate'].includes(phase))
    return { refusal: `--phase must be run or automate, got "${phase}".` };
  if (update && phase !== 'automate') {
    return { refusal: 'baselines are updated in the automate phase only: add --phase automate.' };
  }
  if (forwarded.some((arg) => UPDATE_FLAGS.has(arg) || arg.startsWith('--update-snapshots='))) {
    return {
      refusal: "pass --update with --phase automate instead of Playwright's --update-snapshots.",
    };
  }
  return { phase, update, forwarded };
}

/**
 * The environment of the Playwright run: the lane variable, host addresses for the container, and
 * the lane's own JSON report (reports/lanes/visual.json unless QA_JSON_REPORT names one), which
 * the quality gate reads beside the suite's.
 */
export function laneEnvironment(root, env = process.env) {
  const lane = {
    ...env,
    [VISUAL_LANE_ENV]: '1',
    QA_JSON_REPORT: env.QA_JSON_REPORT || 'reports/lanes/visual.json',
  };
  for (const [pack, entry] of Object.entries(activeEnvironment(root, env).packs)) {
    const variable = packVariable(pack, 'BASE_URL');
    lane[variable] = containerUrl(env[variable] || entry.base_url);
  }
  return lane;
}

function main() {
  if (!inPinnedImage()) {
    console.error(
      'visual-lane: refused: this is not the pinned Playwright image. Screenshots from another machine ' +
        'are not comparable. Run `npm run lanes:visual`, which starts the image.',
    );
    process.exit(2);
  }
  const problem = imageProblem(REPO_ROOT);
  if (problem) {
    console.error(`visual-lane: refused: ${problem}`);
    process.exit(2);
  }
  const plan = planLane(process.argv.slice(2));
  if (plan.refusal) {
    console.error(`visual-lane: refused: ${plan.refusal}`);
    process.exit(2);
  }
  const cli = join(REPO_ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
  const args = [
    cli,
    'test',
    '--grep',
    '@visual',
    ...(plan.update ? ['--update-snapshots'] : []),
    ...plan.forwarded,
  ];
  console.log(`visual-lane: ${plan.phase} phase${plan.update ? ', writing baselines' : ''}`);
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: laneEnvironment(REPO_ROOT),
  });
  process.exit(exitCodeOf(result));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
