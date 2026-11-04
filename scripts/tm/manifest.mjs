#!/usr/bin/env node
/**
 * The neutral case manifest every test-management adapter reads (ADR 0010): what the cases are and
 * how the latest run went, in one shape that belongs to no tool.
 *
 *   cases     designed cases from the registries, joined with the spec test that automates each one;
 *             a spec test whose title carries a case id but that no registry lists is included too
 *             (source "spec"), so nothing executed goes missing
 *   results   the latest run in allure-results/, one entry per case, keyed by the stable identity
 *             `<pack>-<version>-<TC id>`: retries collapse to the last attempt of each device, and
 *             the case takes the worst status of its devices, listed under `devices`
 *   excluded  results that cannot be attributed to a case, each with its reason: a test
 *             without a case id in its title, or one that never started and so carries no identity
 *
 *   node scripts/tm/manifest.mjs [--pack x] [--results dir] [--out file] [--json]
 *
 * Writes reports/tm/manifest.json by default and prints a summary.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from '../lib/cli.mjs';
import { specCases } from '../lib/corpus.mjs';
import { createLogger } from '../lib/log.mjs';
import { loadRegistries } from '../lib/registry.mjs';
import { A11Y_SWEEP_TAG, KNOWN_GAP_TAG, WEB_VITALS_TAG } from '../lib/tags.mjs';
import { groupRuns, lastAttempts, readResultFiles } from '../lib/results.mjs';

export const MANIFEST_VERSION = 1;
const IDENTITY = /^[a-z][a-z0-9-]*-[a-z0-9][a-z0-9.-]*-TC-[A-Z][A-Z0-9]*-\d+$/;

const issueKeys = (result) =>
  (result.links ?? []).filter((link) => link.type === 'issue').map((link) => link.name ?? link.url);
const label = (result, name) => (result.labels ?? []).find((l) => l.name === name)?.value ?? null;

/**
 * How a known gap is reported (ADR 0010). An armed case passes when its defect is still there and
 * fails when the defect is gone, which is right for the suite and wrong for test management, whose
 * record is the product: there an open gap is a failure and a closed one a pass, flagged so the arm
 * is removed. Null for a case without the @known-gap tag.
 */
export function knownGapOutcome(testCase, status) {
  if (!testCase?.tags?.includes(KNOWN_GAP_TAG)) return null;
  if (status === 'passed') return { status: 'failed', state: 'open' };
  if (status === 'failed') return { status: 'passed', state: 'closed' };
  return null;
}

// The order in which statuses outrank each other when a case ran on several devices.
const SEVERITY = ['skipped', 'unknown', 'passed', 'broken', 'failed'];
const severity = (status) => Math.max(0, SEVERITY.indexOf(status ?? 'unknown'));

/** Name and version of a pack, from its app.json. */
export function readPack(root, pack) {
  const manifest = JSON.parse(readFileSync(join(root, 'apps', pack, 'app.json'), 'utf8'));
  return { name: manifest.name, version: manifest.version, title: manifest.title };
}

/** The app packs under `root`: folders of apps/ with an app.json. */
export function appPacks(root) {
  const apps = join(root, 'apps');
  if (!existsSync(apps)) return [];
  return readdirSync(apps, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(apps, entry.name, 'app.json')))
    .map((entry) => entry.name)
    .sort();
}

/** Designed and automated cases of the given packs, keyed by identity. */
export function collectCases(root, packs) {
  const cases = new Map();
  for (const pack of packs) {
    const app = readPack(root, pack);
    const identityOf = (caseId) => `${app.name}-${app.version}-${caseId}`;
    const tests = new Map();
    for (const test of specCases(root, pack)) {
      if (test.id && !tests.has(test.id)) tests.set(test.id, test);
    }
    for (const registry of loadRegistries(root, pack)) {
      for (const row of registry.cases) {
        const automated = tests.get(row.id);
        cases.set(identityOf(row.id), {
          identity: identityOf(row.id),
          caseId: row.id,
          pack,
          version: app.version,
          source: 'registry',
          feature: registry.meta.feature ?? null,
          title: row.title,
          requirement: row.requirement || null,
          technique: row.technique,
          priority: row.priority,
          status: row.status,
          defect: row.defect || null,
          routes: registry.meta.routes ?? [],
          devices: row.devices,
          registry: registry.file,
          spec: automated ? { file: automated.file, line: automated.line } : null,
          tags: automated?.tags ?? row.tagList,
        });
      }
    }
    for (const [caseId, test] of tests) {
      if (cases.has(identityOf(caseId))) continue;
      cases.set(identityOf(caseId), {
        identity: identityOf(caseId),
        caseId,
        pack,
        version: app.version,
        source: 'spec',
        feature: null,
        title: test.title,
        requirement: null,
        technique: null,
        priority: null,
        status: null,
        defect: null,
        routes: [],
        devices: null,
        registry: null,
        spec: { file: test.file, line: test.line },
        tags: test.tags,
      });
    }
  }
  return cases;
}

/** Results of the latest run attributed to cases, and everything that could not be, with reasons. */
// The spec file a result came from: allure-playwright starts `fullName` with its relative path.
const specOf = (result) =>
  String(result.fullName ?? '')
    .split(' ')[0]
    .replace(/\\/g, '/');

/**
 * Results of the latest run of the selected packs' specs, attributed to cases, and everything that
 * could not be, with reasons. Results from elsewhere (the core's unit tests) are not test-management
 * cases: they are counted in `outside`, not listed, and never decide which run is the latest.
 */
/**
 * Runs started closer together than the idle gap of groupRuns are told apart by their run id: the
 * run of the result that started last is kept, with the results without a run id that started once
 * it had begun.
 */
function latestRun(group) {
  const labelled = group.filter((result) => label(result, 'run'));
  if (new Set(labelled.map((result) => label(result, 'run'))).size < 2) return group;
  const id = label(
    labelled.reduce((a, b) => ((b.start ?? 0) > (a.start ?? 0) ? b : a)),
    'run',
  );
  const begun = Math.min(
    ...labelled.filter((result) => label(result, 'run') === id).map((result) => result.start ?? 0),
  );
  return group.filter((result) =>
    label(result, 'run') ? label(result, 'run') === id : (result.start ?? 0) >= begun,
  );
}

export function collectResults(resultsDir, cases, packs) {
  const prefixes = packs.map((pack) => `apps/${pack}/specs/`);
  const all = readResultFiles(resultsDir);
  const inPacks = all.filter((result) =>
    prefixes.some((prefix) => specOf(result).startsWith(prefix)),
  );
  const run = latestRun(groupRuns(inPacks).at(-1) ?? []);
  // A case runs once per device project: the last attempt of each device counts, and the case
  // takes the worst status of its devices, so a failure on one device is never hidden by a pass on
  // another. Results recorded without a device label count as one device.
  const { byKey, unkeyed } = lastAttempts(run, (result) =>
    IDENTITY.test(result.testCaseId ?? '')
      ? `${result.testCaseId}@${label(result, 'device') ?? ''}`
      : null,
  );
  const tagged = (result, tag) =>
    (result.labels ?? []).some(
      (l) => l.name === 'tag' && `@${String(l.value).replace(/^@/, '')}` === tag,
    );
  const excluded = unkeyed.map((result) => ({
    file: result.file,
    name: result.name ?? '(unnamed)',
    reason: tagged(result, A11Y_SWEEP_TAG)
      ? `a test of the accessibility sweep (${A11Y_SWEEP_TAG}), one per route and role, not a designed case`
      : tagged(result, WEB_VITALS_TAG)
        ? `a web vitals measurement (${WEB_VITALS_TAG}) against the pack's budget, not a designed case`
        : 'no case identity: the title carries no TC id, or the test never started',
  }));
  const byIdentity = new Map();
  for (const [key, attempt] of byKey) {
    const identity = key.slice(0, key.lastIndexOf('@'));
    byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), attempt]);
  }
  const results = [];
  for (const [identity, attempts] of byIdentity) {
    if (!cases.has(identity)) {
      for (const { result } of attempts) {
        excluded.push({
          file: result.file,
          name: result.name ?? '(unnamed)',
          reason: `identity ${identity} matches no case of the selected packs`,
        });
      }
      continue;
    }
    const worst = attempts.reduce((a, b) =>
      severity(b.result.status) > severity(a.result.status) ? b : a,
    );
    const starts = attempts.map(({ result }) => result.start).filter(Boolean);
    const stops = attempts.map(({ result }) => result.stop).filter(Boolean);
    const gap = knownGapOutcome(cases.get(identity), worst.result.status);
    results.push({
      identity,
      status: gap?.status ?? worst.result.status ?? 'unknown',
      knownGap: gap?.state ?? null,
      name: worst.result.name ?? '',
      start: starts.length ? Math.min(...starts) : null,
      stop: stops.length ? Math.max(...stops) : null,
      durationMs:
        attempts.reduce(
          (sum, { result }) => sum + (result.start && result.stop ? result.stop - result.start : 0),
          0,
        ) || null,
      attempts: attempts.reduce((sum, a) => sum + a.attempts, 0),
      devices: Object.fromEntries(
        attempts
          .map(({ result }) => [label(result, 'device') ?? 'default', result.status ?? 'unknown'])
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
      issues: [...new Set(attempts.flatMap(({ result }) => issueKeys(result)))],
      run: label(worst.result, 'run'),
      file: worst.result.file,
    });
  }
  results.sort((a, b) => a.identity.localeCompare(b.identity));
  excluded.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file));
  const recordedRuns = [...new Set(run.map((r) => label(r, 'run')).filter(Boolean))].sort();
  return {
    runSize: run.length,
    outside: all.length - inPacks.length,
    recordedRuns,
    results,
    excluded,
  };
}

export function buildManifest({ root = REPO_ROOT, packs, resultsDir, runId, now = new Date() }) {
  const selected = packs ?? appPacks(root);
  const cases = collectCases(root, selected);
  const { runSize, outside, recordedRuns, results, excluded } = collectResults(
    resultsDir ?? join(root, 'allure-results'),
    cases,
    selected,
  );
  return {
    manifestVersion: MANIFEST_VERSION,
    generatedAt: now.toISOString(),
    runId: runId ?? null,
    packs: selected,
    cases: [...cases.values()].sort((a, b) => a.identity.localeCompare(b.identity)),
    results,
    excluded,
    runSize,
    outside,
    recordedRuns,
  };
}

function main() {
  const { values } = parseArgs({
    options: {
      pack: { type: 'string' },
      results: { type: 'string' },
      out: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
  });
  const log = createLogger('tm-manifest');
  const packs = values.pack ? [values.pack] : undefined;
  const manifest = buildManifest({
    packs,
    resultsDir: values.results ? resolve(values.results) : undefined,
    runId: log.runId,
  });
  const out = resolve(values.out ?? join(REPO_ROOT, 'reports', 'tm', 'manifest.json'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  if (values.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }
  const byStatus = manifest.results.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
    {},
  );
  log.info('manifest written', {
    file: relative(REPO_ROOT, out).replace(/\\/g, '/'),
    cases: manifest.cases.length,
    results: manifest.results.length,
    excluded: manifest.excluded.length,
    outside: manifest.outside,
    ...byStatus,
  });
  for (const item of manifest.excluded) {
    log.warn('result excluded', { name: item.name, reason: item.reason });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
