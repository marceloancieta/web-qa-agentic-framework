import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildManifest } from '../tm/manifest.mjs';

// A small repository with one pack: registry, specs, and an Allure results directory.
const ROOT = join(import.meta.dirname, '..', '__fixtures__', 'tm-repo');
const T0 = Date.UTC(2026, 9, 9, 12);

function resultsDir(results) {
  const dir = mkdtempSync(join(tmpdir(), 'tm-results-'));
  results.forEach((result, i) =>
    writeFileSync(join(dir, `r${i}-result.json`), JSON.stringify(result)),
  );
  return dir;
}

const result = (fields) => ({
  status: 'passed',
  start: T0,
  stop: T0 + 100,
  labels: [],
  fullName: 'apps/shop/specs/items.spec.ts › a test',
  ...fields,
});

test('cases come from the registries, joined with the spec test that automates them', () => {
  const manifest = buildManifest({ root: ROOT, resultsDir: resultsDir([]), now: new Date(T0) });
  const byId = new Map(manifest.cases.map((c) => [c.caseId, c]));
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.generatedAt, '2026-10-09T12:00:00.000Z');
  assert.deepEqual(manifest.packs, ['shop']);
  const draft = byId.get('TC-ITEM-01');
  assert.deepEqual(
    [draft.identity, draft.source, draft.status, draft.spec],
    ['shop-v1-TC-ITEM-01', 'registry', 'draft', null],
  );
  assert.equal(byId.get('TC-ITEM-03').spec.file, 'apps/shop/specs/items.spec.ts');
  assert.ok(
    manifest.cases.some((c) => c.source === 'spec'),
    'an unregistered spec test is listed',
  );
});

test('results of the latest run attach to cases; retries collapse; the rest is excluded by name', () => {
  const dir = resultsDir([
    // An older run, more than ten minutes earlier: ignored.
    result({
      testCaseId: 'shop-v1-TC-ITEM-03',
      status: 'failed',
      start: T0 - 3_600_000,
      stop: T0 - 3_599_000,
    }),
    result({ testCaseId: 'shop-v1-TC-ITEM-03', status: 'failed', name: 'TC-ITEM-03 first try' }),
    result({
      testCaseId: 'shop-v1-TC-ITEM-03',
      start: T0 + 200,
      stop: T0 + 300,
      name: 'TC-ITEM-03 retry',
    }),
    result({
      testCaseId: 'shop-v1-TC-ITEM-08',
      status: 'failed',
      links: [{ type: 'issue', name: 'BUG-7', url: 'https://tracker.example/BUG-7' }],
      labels: [{ name: 'run', value: 'abc123' }],
    }),
    result({ testCaseId: '5f2b1c0d9e8a7f6b5c4d3e2f1a0b9c8d', name: 'a test without a case id' }),
    result({
      testCaseId: '0a1b2c3d4e5f60718293a4b5c6d7e8f9',
      name: 'customer /#/search',
      labels: [{ name: 'tag', value: '@a11y-sweep' }],
    }),
    result({ testCaseId: 'other-v2-TC-ZZZ-01', name: 'TC-ZZZ-01 from another pack' }),
    // A unit test of the core, run later: not a case, and it must not become the latest run.
    result({
      fullName: 'helpers/__tests__/x.spec.ts › unit',
      start: T0 + 3_600_000,
      stop: T0 + 3_600_100,
    }),
  ]);
  const manifest = buildManifest({ root: ROOT, resultsDir: dir });
  assert.deepEqual([manifest.runSize, manifest.outside], [6, 1]);
  assert.deepEqual(
    manifest.results.map((r) => [r.identity, r.status, r.attempts, r.issues, r.run]),
    [
      ['shop-v1-TC-ITEM-03', 'passed', 2, [], null],
      ['shop-v1-TC-ITEM-08', 'failed', 1, ['BUG-7'], 'abc123'],
    ],
  );
  assert.deepEqual(
    manifest.excluded.map((e) => [e.name, e.reason.split(':')[0]]),
    [
      ['a test without a case id', 'no case identity'],
      [
        'customer /#/search',
        'a test of the accessibility sweep (@a11y-sweep), one per route and role, not a designed case',
      ],
      [
        'TC-ZZZ-01 from another pack',
        'identity other-v2-TC-ZZZ-01 matches no case of the selected packs',
      ],
    ],
  );
});

test('a run started within minutes of the one before is told apart by its run id', () => {
  const run = (id) => [{ name: 'run', value: id }];
  const dir = resultsDir([
    result({ testCaseId: 'shop-v1-TC-ITEM-03', status: 'failed', labels: run('first') }),
    result({ testCaseId: 'shop-v1-TC-ITEM-08', status: 'failed', labels: run('first') }),
    result({ name: 'an unlabelled result of the first run', start: T0 + 50, stop: T0 + 60 }),
    // Two minutes later, with another id: only this run is reported.
    result({
      testCaseId: 'shop-v1-TC-ITEM-03',
      labels: run('second'),
      start: T0 + 120_000,
      stop: T0 + 120_100,
    }),
    result({ name: 'an unlabelled result of the second run', start: T0 + 120_050 }),
  ]);
  const manifest = buildManifest({ root: ROOT, resultsDir: dir });
  assert.deepEqual(manifest.recordedRuns, ['second']);
  assert.deepEqual(
    manifest.results.map((r) => [r.identity, r.status, r.attempts, r.run]),
    [['shop-v1-TC-ITEM-03', 'passed', 1, 'second']],
  );
  assert.deepEqual(
    manifest.excluded.map((e) => e.name),
    ['an unlabelled result of the second run'],
  );
});

test('a missing results directory yields cases and no results', () => {
  const manifest = buildManifest({ root: ROOT, resultsDir: join(tmpdir(), 'does-not-exist-tm') });
  assert.deepEqual([manifest.results, manifest.excluded, manifest.runSize], [[], [], 0]);
  assert.ok(manifest.cases.length > 0);
});

test('a case on several devices takes the worst status, with each device listed', () => {
  const device = (name) => ({ name: 'device', value: name });
  const dir = resultsDir([
    result({
      testCaseId: 'shop-v1-TC-ITEM-03',
      status: 'failed',
      labels: [device('mobile-chrome')],
      name: 'TC-ITEM-03 on mobile',
    }),
    result({
      testCaseId: 'shop-v1-TC-ITEM-03',
      status: 'passed',
      labels: [device('desktop-chromium')],
      start: T0 + 500,
      stop: T0 + 600,
    }),
    result({
      testCaseId: 'shop-v1-TC-ITEM-08',
      status: 'failed',
      labels: [device('desktop-chromium')],
    }),
    result({
      testCaseId: 'shop-v1-TC-ITEM-08',
      status: 'passed',
      labels: [device('desktop-chromium')],
      start: T0 + 200,
      stop: T0 + 300,
    }),
  ]);
  const byId = new Map(
    buildManifest({ root: ROOT, resultsDir: dir }).results.map((r) => [r.identity, r]),
  );
  const both = byId.get('shop-v1-TC-ITEM-03');
  assert.equal(both.status, 'failed', 'a later pass on desktop does not hide the mobile failure');
  assert.deepEqual(both.devices, { 'desktop-chromium': 'passed', 'mobile-chrome': 'failed' });
  assert.equal(both.name, 'TC-ITEM-03 on mobile');
  const retried = byId.get('shop-v1-TC-ITEM-08');
  assert.deepEqual(
    [retried.status, retried.attempts],
    ['passed', 2],
    'a retry on one device still collapses',
  );
});

test('known gaps are reported as the product stands: open is failed, closed is passed', async () => {
  const { knownGapOutcome } = await import('../tm/manifest.mjs');
  const gap = { tags: ['@regression', '@known-gap'] };
  assert.deepEqual(knownGapOutcome(gap, 'passed'), { status: 'failed', state: 'open' });
  assert.deepEqual(knownGapOutcome(gap, 'failed'), { status: 'passed', state: 'closed' });
  assert.equal(knownGapOutcome(gap, 'skipped'), null);
  assert.equal(knownGapOutcome({ tags: ['@regression'] }, 'passed'), null);
});
