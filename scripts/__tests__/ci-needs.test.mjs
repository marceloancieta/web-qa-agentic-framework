import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { unsuccessfulJobs } from '../ci-needs.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'ci-needs.mjs');
const run = (needs) =>
  spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, QA_NEEDS: needs === undefined ? '' : needs },
  });
const job = (result) => ({ result, outputs: {} });

test('every job succeeded: no unsuccessful job', () => {
  assert.deepEqual(unsuccessfulJobs({ gates: job('success'), report: job('success') }), []);
});

test('a failure, a cancellation and a skip each fail the verdict', () => {
  assert.deepEqual(
    unsuccessfulJobs({
      gates: job('success'),
      suite: job('failure'),
      lane: job('cancelled'),
      report: job('skipped'),
      odd: {},
    }),
    [
      { job: 'suite', result: 'failure' },
      { job: 'lane', result: 'cancelled' },
      { job: 'report', result: 'skipped' },
      { job: 'odd', result: 'unknown' },
    ],
  );
});

test('a context with no job, or not an object, cannot give a verdict', () => {
  assert.throws(() => unsuccessfulJobs({}), /names no job/);
  assert.throws(() => unsuccessfulJobs([]), /not an object/);
  assert.throws(() => unsuccessfulJobs(null), /not an object/);
});

test('the CLI: exit 0 green, 1 with the jobs that were not, 2 without a usable context', () => {
  const green = run(JSON.stringify({ gates: job('success'), report: job('success') }));
  assert.equal(green.status, 0);
  assert.match(green.stdout, /every job succeeded/);

  const red = run(JSON.stringify({ gates: job('success'), suite: job('cancelled') }));
  assert.equal(red.status, 1);
  assert.match(red.stderr, /suite cancelled; the change is not green/);

  assert.equal(run(undefined).status, 2);
  assert.match(run('not json').stderr, /not JSON/);
  assert.equal(run('{}').status, 2);
});
