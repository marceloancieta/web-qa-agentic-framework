#!/usr/bin/env node
/**
 * Joins the blob reports of a sharded run (CI-01) into the reports one unsharded run writes: the
 * HTML report and the JSON report the quality gate reads.
 *
 *   node scripts/ci-merge.mjs [--blobs <dir>] [--json <file>]
 *
 * Each shard writes its blob with QA_BLOB_REPORT=1 into blob-report/, and CI collects the shards'
 * folders into one, `--blobs` (default blob-report). The JSON report goes to `--json`, then
 * $QA_JSON_REPORT, then reports/playwright.json. The blobs were redacted by each shard's run, so
 * the merged reports hold nothing the shards did not.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './lib/cli.mjs';
import { describeExit, exitCodeOf } from './lib/spawn.mjs';

const PLAYWRIGHT_CLI = join(REPO_ROOT, 'node_modules', '@playwright', 'test', 'cli.js');

/** The merge-reports invocation for a folder of blobs: Playwright's arguments and environment. */
export function mergePlan({ blobs, json, env = process.env }) {
  return {
    args: ['merge-reports', '--reporter', 'html,json', blobs],
    env: { ...env, PLAYWRIGHT_JSON_OUTPUT_FILE: json, PLAYWRIGHT_HTML_OPEN: 'never' },
  };
}

function main() {
  const { values } = parseArgs({
    options: { blobs: { type: 'string' }, json: { type: 'string' } },
  });
  const blobs = resolve(values.blobs ?? join(REPO_ROOT, 'blob-report'));
  const json = resolve(
    values.json ?? (process.env.QA_JSON_REPORT || join(REPO_ROOT, 'reports', 'playwright.json')),
  );
  const zips = existsSync(blobs) ? readdirSync(blobs).filter((name) => name.endsWith('.zip')) : [];
  if (zips.length === 0) {
    console.error(`ci-merge: no blob report in ${blobs}; run the shards with QA_BLOB_REPORT=1.`);
    process.exit(1);
  }
  console.log(`ci-merge: joining ${zips.length} blob report(s) from ${blobs}.`);
  const plan = mergePlan({ blobs, json });
  const result = spawnSync(process.execPath, [PLAYWRIGHT_CLI, ...plan.args], {
    cwd: REPO_ROOT,
    env: plan.env,
    stdio: 'inherit',
  });
  const code = exitCodeOf(result);
  if (code !== 0) console.error(`ci-merge: merge-reports ${describeExit(result)}.`);
  else console.log(`ci-merge: HTML report in playwright-report/, JSON report at ${json}.`);
  process.exitCode = code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
