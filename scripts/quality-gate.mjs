#!/usr/bin/env node
/**
 * The quality gate: one verdict for a run, from Playwright's JSON report and the thresholds of
 * qa-config `quality_gate`. Each configured check yields PASS, REVIEW (keep the build green and
 * publish the evidence for a person to look at) or FAIL; a check without data is SKIPPED.
 *
 *   pass_rate      passed cases over executed cases, in percent; a flaky case (failed, then passed
 *                  on a retry) counts as passed and is listed.
 *   accessibility  new violations (not in the pack's baseline) per axe impact, read from the
 *                  `axe <route>` attachments the a11y fixture writes.
 *   visual         failed @visual cases.
 *   mutation       the mutation score of `npm run mutation` (Stryker's JSON reports, one per run,
 *                  taken together), in percent: detected mutants (killed or timed out) over every
 *                  mutant that ran or that no test covers.
 *
 *   node scripts/quality-gate.mjs [--report <playwright.json>]... [--results <allure-results>]
 *                                 [--mutation <mutation.json>]... [--summary <file.md>] [--root <dir>]
 *
 * The report defaults to $QA_JSON_REPORT, then reports/playwright.json, which every suite run
 * writes. Several `--report`s are read as one run: in CI, the sharded matrix merged by
 * `npm run ci:merge` and the reports of the lanes, all with one QA_RUN_ID. A report is refused when
 * it is not of the latest run (`staleReasons`). `--mutation` alone judges only the mutation score,
 * with no run report: mutation testing runs on demand, apart from the suite. Exit codes: 0 PASS or
 * REVIEW; 1 FAIL, no report or a refused report; 2 usage error.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './lib/cli.mjs';
import { readConfig } from './lib/qa-config.mjs';
import { readResultFiles } from './lib/results.mjs';
import { VISUAL_TAG } from './lib/tags.mjs';

const IMPACTS = ['critical', 'serious', 'moderate', 'minor'];
const RANK = { PASS: 0, SKIPPED: 0, REVIEW: 1, FAIL: 2 };

/** Every test of a Playwright JSON report: `{ title, tags, status, attachments }`. */
export function reportTests(report) {
  const tests = [];
  const walk = (suite, titles) => {
    for (const child of suite.suites ?? []) walk(child, [...titles, child.title]);
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const last = test.results?.at(-1);
        tests.push({
          title: [...titles, spec.title].filter(Boolean).join(' > '),
          project: test.projectName,
          tags: spec.tags?.map((tag) => (tag.startsWith('@') ? tag : `@${tag}`)) ?? [],
          status: test.status,
          attachments: last?.attachments ?? [],
        });
      }
    }
  };
  for (const suite of report.suites ?? []) walk(suite, [suite.title]);
  return tests;
}

function attachmentJson(attachment, reportDir) {
  try {
    if (attachment.body) return JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
    if (attachment.path)
      return JSON.parse(readFileSync(resolve(reportDir, attachment.path), 'utf8'));
  } catch {
    return null;
  }
  return null;
}

/** New accessibility violations per impact across every axe attachment of the run. */
export function newViolations(tests, reportDir = '.') {
  const counts = Object.fromEntries(IMPACTS.map((impact) => [impact, 0]));
  let scans = 0;
  for (const test of tests) {
    for (const attachment of test.attachments.filter((a) => a.name.startsWith('axe '))) {
      const data = attachmentJson(attachment, reportDir);
      if (!data?.comparison) continue;
      scans += 1;
      for (const violation of data.comparison.new ?? []) {
        if (violation.impact in counts) counts[violation.impact] += 1;
      }
    }
  }
  return { scans, counts };
}

function bandBelow(value, { fail_below_pct: fail, review_below_pct: review }) {
  if (value < fail) return 'FAIL';
  return review !== undefined && value < review ? 'REVIEW' : 'PASS';
}

function bandAbove(counts, { fail_above: fail = {}, review_above: review = {} }) {
  const over = (limits) =>
    Object.entries(limits).some(([key, limit]) => (counts[key] ?? 0) > limit);
  if (over(fail)) return 'FAIL';
  return over(review) ? 'REVIEW' : 'PASS';
}

/** The run a report describes: the run id the configuration recorded, and when the run ended. */
export function reportRun(report) {
  const start = Date.parse(report.stats?.startTime ?? '');
  return {
    runId: report.config?.metadata?.runId ?? null,
    end: Number.isNaN(start) ? null : start + (report.stats?.duration ?? 0),
  };
}

/**
 * Why the reports do not describe the latest run, or [] when they do: they come from different
 * runs, from a run other than `expectedRunId`, or a pack result started after every report ended,
 * so a later run exists whose report was not passed.
 */
export function staleReasons(reports, { expectedRunId, newestResultStart } = {}) {
  const runs = reports.map(reportRun);
  const ids = [...new Set(runs.map((r) => r.runId).filter(Boolean))];
  const reasons = [];
  if (ids.length > 1) reasons.push(`the reports come from different runs: ${ids.join(', ')}`);
  if (expectedRunId && ids.some((id) => id !== expectedRunId))
    reasons.push(`QA_RUN_ID is ${expectedRunId}, the report is of run ${ids.join(', ')}`);
  const ends = runs.map((r) => r.end).filter((end) => end !== null);
  const lastEnd = ends.length ? Math.max(...ends) : null;
  if (newestResultStart && lastEnd !== null && newestResultStart > lastEnd)
    reasons.push(
      `a run started at ${new Date(newestResultStart).toISOString()}, after the report's run ended at ${new Date(lastEnd).toISOString()}: pass that run's report`,
    );
  return reasons;
}

/** The start of the newest result of a pack's spec in the Allure results, or null. */
export function newestPackResultStart(resultsDir) {
  const starts = readResultFiles(resultsDir)
    .filter((r) =>
      String(r.fullName ?? '')
        .replace(/\\/g, '/')
        .startsWith('apps/'),
    )
    .map((r) => r.start)
    .filter(Number.isFinite);
  return starts.length ? Math.max(...starts) : null;
}

/** Mutant statuses of Stryker's report (mutation-testing-report-schema) that enter the score. */
const DETECTED = ['Killed', 'Timeout'];
const UNDETECTED = ['Survived', 'NoCoverage'];

/**
 * The mutation score of Stryker JSON reports, taken together:
 * `{ score, detected, valid, survived, noCoverage }`, the score in percent with one decimal, or
 * null when no mutant entered it. Compile and runtime errors, ignored and pending mutants are left
 * out, as Stryker leaves them out.
 */
export function mutationScore(reports) {
  const counts = {};
  for (const report of reports) {
    for (const file of Object.values(report?.files ?? {})) {
      for (const mutant of file.mutants ?? [])
        counts[mutant.status] = (counts[mutant.status] ?? 0) + 1;
    }
  }
  const sum = (statuses) => statuses.reduce((total, status) => total + (counts[status] ?? 0), 0);
  const detected = sum(DETECTED);
  const valid = detected + sum(UNDETECTED);
  return {
    score: valid === 0 ? null : Math.round((detected / valid) * 1000) / 10,
    detected,
    valid,
    survived: counts.Survived ?? 0,
    noCoverage: counts.NoCoverage ?? 0,
  };
}

function mutationCheck(mutation, threshold) {
  if (mutation.length === 0)
    return {
      name: 'mutation',
      verdict: 'SKIPPED',
      detail: 'no mutation report (npm run mutation)',
    };
  const { score, detected, valid, survived, noCoverage } = mutationScore(mutation);
  if (score === null)
    return { name: 'mutation', verdict: 'SKIPPED', detail: 'the mutation reports have no mutant' };
  return {
    name: 'mutation',
    verdict: bandBelow(score, threshold),
    detail: `${score}% (${detected}/${valid} detected; ${survived} survived, ${noCoverage} not covered)`,
  };
}

/**
 * The checks of the gate for a parsed report: `[{ name, verdict, detail }]` and the overall.
 * `mutation` is Stryker's parsed JSON reports, one per run, judged as one score.
 */
export function evaluate(report, gate, reportDir = '.', { mutation = [] } = {}) {
  const tests = reportTests(report);
  const checks = [];
  if (gate.pass_rate) {
    const executed = tests.filter((t) => t.status !== 'skipped');
    const passed = executed.filter((t) => t.status === 'expected' || t.status === 'flaky');
    const flaky = executed.filter((t) => t.status === 'flaky');
    if (executed.length === 0)
      checks.push({ name: 'pass_rate', verdict: 'SKIPPED', detail: 'no case ran' });
    else {
      const pct = Math.round((passed.length / executed.length) * 1000) / 10;
      const flakyNote = flaky.length
        ? `; flaky: ${flaky.map((t) => `${t.title} [${t.project}]`).join(', ')}`
        : '';
      checks.push({
        name: 'pass_rate',
        verdict: bandBelow(pct, gate.pass_rate),
        detail: `${pct}% (${passed.length}/${executed.length})${flakyNote}`,
      });
    }
  }
  if (gate.accessibility) {
    const { scans, counts } = newViolations(tests, reportDir);
    const detail = IMPACTS.map((impact) => `${impact} ${counts[impact]}`).join(', ');
    checks.push(
      scans === 0
        ? { name: 'accessibility', verdict: 'SKIPPED', detail: 'no accessibility scan in the run' }
        : {
            name: 'accessibility',
            verdict: bandAbove(counts, gate.accessibility),
            detail: `new violations in ${scans} scan(s): ${detail}`,
          },
    );
  }
  if (gate.visual) {
    const visual = tests.filter((t) => t.tags.includes(VISUAL_TAG) && t.status !== 'skipped');
    const failed = visual.filter((t) => t.status === 'unexpected').length;
    checks.push(
      visual.length === 0
        ? { name: 'visual', verdict: 'SKIPPED', detail: 'no @visual case ran' }
        : {
            name: 'visual',
            verdict: bandAbove(
              { failed },
              {
                fail_above: { failed: gate.visual.fail_above },
                review_above:
                  gate.visual.review_above === undefined
                    ? {}
                    : { failed: gate.visual.review_above },
              },
            ),
            detail: `${failed} of ${visual.length} visual case(s) differ`,
          },
    );
  }
  if (gate.mutation) checks.push(mutationCheck(mutation, gate.mutation));
  const overall = checks.reduce(
    (worst, check) => (RANK[check.verdict] > RANK[worst] ? check.verdict : worst),
    'PASS',
  );
  return { checks, overall };
}

function summary({ checks, overall }) {
  const rows = checks.map((c) => `| ${c.name} | ${c.verdict} | ${c.detail} |`);
  return `# Quality gate: ${overall}\n\n| Check | Verdict | Detail |\n|---|---|---|\n${rows.join('\n')}\n`;
}

function main() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        report: { type: 'string', multiple: true },
        results: { type: 'string' },
        mutation: { type: 'string', multiple: true },
        summary: { type: 'string' },
        root: { type: 'string' },
      },
    }));
  } catch (error) {
    console.error(`quality-gate: ${error.message}`);
    process.exit(2);
  }
  const root = resolve(values.root ?? REPO_ROOT);
  const gate = readConfig(root).config.quality_gate ?? {};
  const mutation = (values.mutation ?? []).map(readMutation);
  if (mutation.length > 0 && !values.report) {
    if (!gate.mutation) {
      console.error('quality-gate: --mutation needs qa-config quality_gate.mutation.');
      process.exit(2);
    }
    finish(evaluate({ suites: [] }, { mutation: gate.mutation }, '.', { mutation }), values);
    return;
  }
  const reportFiles = (
    values.report ?? [process.env.QA_JSON_REPORT || join(root, 'reports', 'playwright.json')]
  ).map((file) => resolve(file));
  const missing = reportFiles.filter((file) => !existsSync(file));
  if (missing.length) {
    console.error(`quality-gate: no report at ${missing.join(', ')}; run the suite first.`);
    process.exit(1);
  }
  const reports = reportFiles.map((file) => JSON.parse(readFileSync(file, 'utf8')));
  const stale = staleReasons(reports, {
    expectedRunId: process.env.QA_RUN_ID,
    newestResultStart: newestPackResultStart(
      resolve(values.results ?? join(root, 'allure-results')),
    ),
  });
  if (stale.length) {
    for (const reason of stale) console.error(`quality-gate: report refused: ${reason}`);
    process.exit(1);
  }
  // Attachments are recorded with absolute paths, so the reports' suites can be read as one.
  const combined = { suites: reports.flatMap((report) => report.suites ?? []) };
  finish(evaluate(combined, gate, dirname(reportFiles[0]), { mutation }), values);
}

/** Stryker's JSON report at `file`; a missing or unreadable one ends the gate with exit 1. */
function readMutation(file) {
  try {
    return JSON.parse(readFileSync(resolve(file), 'utf8'));
  } catch (error) {
    console.error(
      `quality-gate: cannot read the mutation report ${file} (${error.message}); run npm run mutation first.`,
    );
    process.exit(1);
  }
}

/** Print the checks, write the summary when asked, and set the exit code from the overall. */
function finish(result, values) {
  for (const check of result.checks)
    console.log(
      `quality-gate: ${check.name.padEnd(13)} ${check.verdict.padEnd(7)} ${check.detail}`,
    );
  console.log(`quality-gate: ${result.overall}`);
  if (values.summary) {
    mkdirSync(dirname(resolve(values.summary)), { recursive: true });
    writeFileSync(resolve(values.summary), summary(result));
  }
  process.exitCode = result.overall === 'FAIL' ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
