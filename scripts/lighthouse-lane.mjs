#!/usr/bin/env node
/**
 * Lighthouse lane: audits of each pack's routes, judged against the minimum scores the active
 * environment gives the pack (qa-config `performance.lighthouse`).
 *
 *   npm run lanes:lighthouse -- [--pack <pack>]... [--form-factor desktop|mobile]
 *
 * - **Where.** Only packs whose entry in the active environment has `performance.lighthouse`, at the
 *   base URL qa-config names. A `QA_<PACK>_BASE_URL` that points at another origin is refused, and
 *   so is an environment whose name starts with "prod": the lane never audits a host qa-config does
 *   not name, nor a production one. An audit that ends on another origin (a redirect) fails.
 * - **Chrome.** Playwright's own Chromium, the build the suite runs, started with a debugging port
 *   that Lighthouse drives. Nothing else is downloaded, and the pack's `cookies` (app.json) are in
 *   the profile, so the audited page is the one the cases see; its `third_party_hosts` are blocked
 *   as in every context of the suite.
 * - **What.** Each route `runs` times (3) per form factor in `min_scores`, with Lighthouse's own
 *   emulation and throttling for that form factor; the categories are the ones `min_scores` names
 *   (performance, accessibility, best-practices). The median score of each category is judged:
 *   one slow audit of three does not fail a route, a slower page does.
 * - **Evidence.** The HTML report of the audit closest to the median performance score, under
 *   `reports/lighthouse/<pack>/<form factor>/`, and every score in `reports/lighthouse/summary.json`.
 *
 * Exit codes: 0 every median reached its minimum, or no pack configures the lane; 1 a score below
 * its minimum, an audit that failed or an application that did not answer; 2 refused (usage, a
 * base URL qa-config does not name, a production environment).
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/cli.mjs';
import { activeEnvironment, packVariable } from './lib/qa-config.mjs';

export const FORM_FACTORS = ['desktop', 'mobile'];
export const DEFAULT_RUNS = 3;
const REPORTS = join('reports', 'lighthouse');

export const USAGE =
  'usage: npm run lanes:lighthouse -- [--pack <pack>]... [--form-factor desktop|mobile]';

/** The median of a list of numbers; the mean of the middle two for an even count. */
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** A file name for a route: `/#/search` gives `search`, `/` gives `root`. */
export function routeSlug(route) {
  const words = route.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words.join('-').toLowerCase() || 'root';
}

/**
 * The audits of the lane, `{ audits, leftOut }`, or `{ refusal }`. `environment` is
 * `activeEnvironment`'s result; `packs` and `formFactor` narrow it. Each audit is
 * `{ pack, formFactor, route, url, origin, runs, minScores }`.
 */
export function planAudits(environment, { packs = [], formFactor = null } = {}, env = process.env) {
  const { source, name, packs: entries } = environment;
  if (/^prod/i.test(name)) {
    return {
      refusal: `environment "${name}" looks like production; the Lighthouse lane never audits one.`,
    };
  }
  if (formFactor && !FORM_FACTORS.includes(formFactor)) {
    return { refusal: `--form-factor takes ${FORM_FACTORS.join(' or ')}, got "${formFactor}".` };
  }
  const unknown = packs.filter((pack) => !Object.hasOwn(entries, pack));
  if (unknown.length > 0) {
    return {
      refusal: `${source} has no app.environments.${name}.packs.${unknown.join(', ')}: Lighthouse audits only the packs qa-config names.`,
    };
  }
  const audits = [];
  const leftOut = [];
  for (const pack of (packs.length ? packs : Object.keys(entries)).sort()) {
    const entry = entries[pack];
    const config = entry.performance?.lighthouse;
    if (!config) {
      leftOut.push(`${pack}: no app.environments.${name}.packs.${pack}.performance.lighthouse`);
      continue;
    }
    const configured = new URL(entry.base_url).origin;
    const override = env[packVariable(pack, 'BASE_URL')];
    if (override && new URL(override).origin !== configured) {
      return {
        refusal: `${packVariable(pack, 'BASE_URL')} points at ${new URL(override).origin}, not ${configured} as ${source} names; the Lighthouse lane audits only the hosts qa-config names.`,
      };
    }
    const baseUrl = (override || entry.base_url).replace(/\/+$/, '');
    for (const factor of FORM_FACTORS) {
      const minScores = config.min_scores[factor];
      if (!minScores || (formFactor && factor !== formFactor)) continue;
      for (const route of config.routes) {
        audits.push({
          pack,
          formFactor: factor,
          route,
          url: `${baseUrl}${route}`,
          origin: configured,
          runs: config.runs ?? DEFAULT_RUNS,
          minScores,
        });
      }
    }
  }
  return { audits, leftOut };
}

/**
 * The verdict of one audit from its runs, `{ scores, findings }`: the median score (0-100) of each
 * category `minScores` names, and why it fails, one line per problem. A run is
 * `{ scores: { <category>: number | null }, finalUrl, error }`.
 */
export function judge(audit, runs) {
  const findings = [];
  for (const [index, run] of runs.entries()) {
    if (run.error) findings.push(`run ${index + 1} failed: ${run.error}`);
    else if (new URL(run.finalUrl).origin !== audit.origin) {
      findings.push(
        `run ${index + 1} ended on ${new URL(run.finalUrl).origin}, not ${audit.origin}`,
      );
    }
  }
  const scores = {};
  for (const [category, minimum] of Object.entries(audit.minScores)) {
    const values = runs.map((run) => run.scores?.[category]).filter((v) => typeof v === 'number');
    if (values.length < runs.length) {
      findings.push(`${category}: no score from ${runs.length - values.length} run(s)`);
    }
    if (values.length === 0) continue;
    scores[category] = median(values);
    if (scores[category] < minimum) {
      findings.push(`${category}: median ${scores[category]} below its minimum ${minimum}`);
    }
  }
  return { scores, findings };
}

/** One line per audit for the console. */
export function auditLine(audit, verdict) {
  const scores = Object.entries(audit.minScores)
    .map(([category, minimum]) => `${category} ${verdict.scores[category] ?? '-'} (min ${minimum})`)
    .join(', ');
  const status = verdict.findings.length ? `FAILED: ${verdict.findings.join('; ')}` : 'ok';
  return `${audit.pack} ${audit.formFactor} ${audit.route}: ${scores}: ${status}`;
}

/** A free TCP port on the loopback interface. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Whether `url` gives any HTTP answer within 5 s; an error page is an answer. */
async function answers(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(5_000) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Start Playwright's Chromium with a debugging port and the pack's cookies; `{ port, close }`.
 * Lighthouse opens its own tab in this profile.
 */
async function startChromium(cookies, baseUrl) {
  const { chromium } = await import('@playwright/test');
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'qa-lighthouse-'));
  const context = await chromium.launchPersistentContext(profile, {
    // The full Chromium build in its new headless mode, which Lighthouse expects, rather than the
    // headless shell Playwright runs tests in.
    channel: 'chromium',
    args: [`--remote-debugging-port=${port}`],
  });
  if (cookies.length) {
    await context.addCookies(cookies.map(([name, value]) => ({ name, value, url: baseUrl })));
  }
  return {
    port,
    close: async () => {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

/** One Lighthouse run: `{ scores, finalUrl, error, html }`. */
async function runLighthouse(audit, port, blocked) {
  const { default: lighthouse, desktopConfig } = await import('lighthouse');
  const flags = {
    port,
    output: 'html',
    logLevel: 'error',
    onlyCategories: Object.keys(audit.minScores),
    blockedUrlPatterns: blocked.map((host) => `*${host}*`),
  };
  try {
    const result = await lighthouse(
      audit.url,
      flags,
      audit.formFactor === 'desktop' ? desktopConfig : undefined,
    );
    const { lhr } = result;
    const scores = Object.fromEntries(
      Object.keys(audit.minScores).map((category) => {
        const score = lhr.categories[category]?.score;
        return [category, typeof score === 'number' ? Math.round(score * 100) : null];
      }),
    );
    return {
      scores,
      finalUrl: lhr.finalDisplayedUrl,
      error: lhr.runtimeError ? `${lhr.runtimeError.code}: ${lhr.runtimeError.message}` : null,
      html: Array.isArray(result.report) ? result.report[0] : result.report,
    };
  } catch (error) {
    return { scores: {}, finalUrl: audit.url, error: error.message, html: null };
  }
}

function readApp(pack) {
  return JSON.parse(readFileSync(join(REPO_ROOT, 'apps', pack, 'app.json'), 'utf8'));
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        pack: { type: 'string', multiple: true, default: [] },
        'form-factor': { type: 'string' },
      },
    }));
  } catch (error) {
    console.error(`lighthouse: refused: ${error.message}\n${USAGE}`);
    process.exit(2);
  }
  const environment = activeEnvironment(REPO_ROOT);
  const plan = planAudits(environment, {
    packs: values.pack,
    formFactor: values['form-factor'] ?? null,
  });
  if (plan.refusal) {
    console.error(`lighthouse: refused: ${plan.refusal}`);
    process.exit(2);
  }
  for (const line of plan.leftOut) console.log(`lighthouse: left out ${line}`);
  if (plan.audits.length === 0) {
    console.log(`lighthouse: no pack of environment "${environment.name}" configures the lane.`);
    process.exit(0);
  }
  const reports = join(REPO_ROOT, REPORTS);
  rmSync(reports, { recursive: true, force: true });
  let code = 0;
  const summary = [];
  for (const pack of [...new Set(plan.audits.map((audit) => audit.pack))]) {
    const audits = plan.audits.filter((audit) => audit.pack === pack);
    const baseUrl = audits[0].url.slice(0, audits[0].url.length - audits[0].route.length);
    if (!(await answers(baseUrl))) {
      console.error(
        `lighthouse: ${pack} at ${baseUrl} did not answer. Check QA_ENV (${environment.name}), ` +
          `app.environments.${environment.name}.packs.${pack} in ${environment.source}, and that the application is up.`,
      );
      code = 1;
      continue;
    }
    const app = readApp(pack);
    const chrome = await startChromium(Object.entries(app.cookies ?? {}), baseUrl);
    try {
      for (const audit of audits) {
        const runs = [];
        for (let i = 0; i < audit.runs; i += 1) {
          runs.push(await runLighthouse(audit, chrome.port, app.third_party_hosts ?? []));
        }
        const verdict = judge(audit, runs);
        console.log(`lighthouse: ${auditLine(audit, verdict)}`);
        if (verdict.findings.length) code = 1;
        const dir = join(reports, pack, audit.formFactor);
        mkdirSync(dir, { recursive: true });
        const middle = verdict.scores.performance;
        const shown =
          runs.find((run) => run.html && run.scores.performance === middle) ??
          runs.find((run) => run.html);
        if (shown) writeFileSync(join(dir, `${routeSlug(audit.route)}.report.html`), shown.html);
        summary.push({
          pack,
          formFactor: audit.formFactor,
          route: audit.route,
          minScores: audit.minScores,
          medians: verdict.scores,
          runs: runs.map(({ scores, finalUrl, error }) => ({ scores, finalUrl, error })),
          findings: verdict.findings,
        });
      }
    } finally {
      await chrome.close();
    }
  }
  mkdirSync(reports, { recursive: true });
  writeFileSync(
    join(reports, 'summary.json'),
    `${JSON.stringify({ environment: environment.name, audits: summary }, null, 2)}\n`,
  );
  console.log(`lighthouse: reports in ${REPORTS}`);
  process.exit(code);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
