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
 *
 *   node scripts/quality-gate.mjs [--report <playwright.json>] [--summary <file.md>] [--root <dir>]
 *
 * The report defaults to $QA_JSON_REPORT, then reports/playwright.json. Exit codes: 0 PASS or
 * REVIEW; 1 FAIL or no report; 2 usage error.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './lib/cli.mjs';
import { readConfig } from './lib/qa-config.mjs';
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

/** The checks of the gate for a parsed report: `[{ name, verdict, detail }]` and the overall. */
export function evaluate(report, gate, reportDir = '.') {
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
        report: { type: 'string' },
        summary: { type: 'string' },
        root: { type: 'string' },
      },
    }));
  } catch (error) {
    console.error(`quality-gate: ${error.message}`);
    process.exit(2);
  }
  const root = resolve(values.root ?? REPO_ROOT);
  const reportFile = resolve(
    values.report ?? process.env.QA_JSON_REPORT ?? join(root, 'reports', 'playwright.json'),
  );
  if (!existsSync(reportFile)) {
    console.error(
      `quality-gate: no report at ${reportFile}; run the suite with QA_JSON_REPORT=<file> first.`,
    );
    process.exit(1);
  }
  const gate = readConfig(root).config.quality_gate ?? {};
  const result = evaluate(JSON.parse(readFileSync(reportFile, 'utf8')), gate, dirname(reportFile));
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
