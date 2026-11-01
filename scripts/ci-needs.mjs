#!/usr/bin/env node
/**
 * `npm run ci:needs`: one verdict over the jobs a workflow job depends on, so branch protection
 * requires one check (`required`) instead of every shard and lane by name, and a change to the
 * matrix never leaves a required check behind (DOC-05).
 *
 * The workflow passes its `needs` context as JSON in QA_NEEDS:
 *
 *   env:
 *     QA_NEEDS: ${{ toJSON(needs) }}
 *
 * Every job must have succeeded. A failure, a cancellation and a skip all fail the verdict: a job
 * that did not run proved nothing, and a green check must mean the code passed its tests.
 *
 * Exit codes: 0 every job succeeded; 1 one did not; 2 QA_NEEDS is missing, not JSON or empty.
 */

import { pathToFileURL } from 'node:url';

export const TOOL = 'ci-needs';

/**
 * The jobs of a `needs` context that did not succeed.
 * @param {Record<string, { result?: string }>} needs
 * @returns {{ job: string, result: string }[]}
 */
export function unsuccessfulJobs(needs) {
  if (!needs || typeof needs !== 'object' || Array.isArray(needs)) {
    throw new Error('QA_NEEDS is not an object of jobs');
  }
  const jobs = Object.entries(needs);
  if (jobs.length === 0) throw new Error('QA_NEEDS names no job; the verdict would prove nothing');
  return jobs
    .map(([job, { result } = {}]) => ({ job, result: result ?? 'unknown' }))
    .filter(({ result }) => result !== 'success');
}

function main() {
  const raw = process.env.QA_NEEDS;
  if (!raw) throw new Error('QA_NEEDS is not set; pass `${{ toJSON(needs) }}` from the workflow');
  let needs;
  try {
    needs = JSON.parse(raw);
  } catch {
    throw new Error('QA_NEEDS is not JSON');
  }
  const failed = unsuccessfulJobs(needs);
  for (const [job, { result }] of Object.entries(needs)) console.log(`${job}: ${result}`);
  if (failed.length > 0) {
    console.error(
      `${TOOL}: ${failed.map(({ job, result }) => `${job} ${result}`).join(', ')}; the change is not green.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`${TOOL}: every job succeeded.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(`${TOOL}: ${error.message}`);
    process.exitCode = 2;
  }
}
