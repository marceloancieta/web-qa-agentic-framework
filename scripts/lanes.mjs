#!/usr/bin/env node
/**
 * The run lanes: one kind of case at a time, with what that kind needs before and after its run.
 *
 *   npm run lanes:mocked -- [playwright options]                 the @mocked cases
 *   npm run lanes:known-gap -- [playwright options]              the @known-gap cases, then which
 *                                                                gaps still fail as armed
 *   npm run lanes:destructive -- [playwright options]            the @destructive cases on one
 *                                                                worker, then each pack's recovery
 *   npm run lanes:flake -- [--repeat <n>] [playwright options]   the @quarantine cases <n> times
 *                                                                each (10), without retries
 *   npm run lanes:web-vitals -- [playwright options]             the @web-vitals measurements on
 *                                                                one worker
 *
 * The visual lane has a script of its own (`scripts/visual-lane.mjs`): it runs in the pinned image.
 * So has the Lighthouse lane (`scripts/lighthouse-lane.mjs`), which runs no Playwright test.
 *
 * A lane lists its selection first: with no case in it, it says so and runs nothing. Playwright
 * options pass through (`--project=juice-shop-*`, a spec file, a `--grep` that narrows the lane's
 * tag). Refused: `--reporter`, which replaces the configured reporters (add a report through
 * QA_JSON_REPORT); `--update-snapshots`, since baselines are design; an option the lane sets itself.
 * Each lane writes Playwright's JSON report to $QA_JSON_REPORT or reports/lanes/<lane>.json, never
 * over the suite's reports/playwright.json; the quality gate takes it as one more `--report`, and
 * the known-gap and flake lanes read it for their summary.
 *
 * The destructive lane refuses a selected pack whose entry in the active environment has no
 * `recovery`. After the run, passed or not, it runs the recovery of every selected pack and waits
 * until the pack's base URL answers (`ready_timeout_s`, 60 by default).
 *
 * Exit codes: 0 the lane passed, or had no case; 1 a case failed, a known gap passed, a recovery
 * failed or Playwright could not run; 2 refused (usage, an option the lane does not take, a pack
 * without recovery).
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/cli.mjs';
import { activeEnvironment, packVariable } from './lib/qa-config.mjs';
import { describeExit, exitCodeOf } from './lib/spawn.mjs';
import {
  A11Y_SWEEP_LANE_ENV,
  A11Y_SWEEP_TAG,
  DESTRUCTIVE_LANE_ENV,
  DESTRUCTIVE_TAG,
  FLAKE_LANE_ENV,
  KNOWN_GAP_TAG,
  MOCKED_TAG,
  QUARANTINE_TAG,
  VISUAL_LANE_ENV,
  WEB_VITALS_LANE_ENV,
  WEB_VITALS_TAG,
} from './lib/tags.mjs';
import { appPacks } from './tm/manifest.mjs';

/**
 * The lanes. `tag` is what a lane selects, `env` the lane variables its run sets (read by
 * `projectTagFilter`), `args` the Playwright options it fixes, `repeat` its default repetition count
 * (`--repeat <n>`), `summary` what it reads from the JSON report after the run, and `recovery`
 * whether the recovery of each selected pack runs after it.
 */
export const LANES = {
  mocked: { tag: MOCKED_TAG },
  'known-gap': { tag: KNOWN_GAP_TAG, summary: summarizeKnownGaps },
  destructive: {
    tag: DESTRUCTIVE_TAG,
    env: { [DESTRUCTIVE_LANE_ENV]: '1' },
    args: ['--workers=1'],
    recovery: true,
  },
  flake: {
    tag: QUARANTINE_TAG,
    env: { [FLAKE_LANE_ENV]: '1' },
    args: ['--retries=0'],
    repeat: 10,
    summary: summarizeFlakes,
  },
  // The accessibility sweep over the app maps (helpers/a11y-sweep.ts): one test per route and role.
  a11y: { tag: A11Y_SWEEP_TAG, env: { [A11Y_SWEEP_LANE_ENV]: '1' } },
  // Web vitals against each pack's budget (helpers/web-vitals.ts): one worker, so no other browser
  // competes for the CPU while a visit is timed.
  'web-vitals': {
    tag: WEB_VITALS_TAG,
    env: { [WEB_VITALS_LANE_ENV]: '1' },
    args: ['--workers=1'],
  },
  // A new lane is one more entry, plus `"lanes:<name>": "node scripts/lanes.mjs <name>"` in
  // package.json.
};

export const USAGE =
  'usage: node scripts/lanes.mjs <lane> [--repeat <n>] [playwright options]\n' +
  `lanes: ${Object.keys(LANES).join(', ')} (npm run lanes:<lane>); the visual lane is npm run lanes:visual, ` +
  'the Lighthouse lane npm run lanes:lighthouse';

const ALIASES = { '-g': '--grep', '-j': '--workers', '-u': '--update-snapshots' };

const REFUSED = {
  '--reporter':
    'it replaces the configured reporters and drops the evidence; add a JSON or JUnit report ' +
    'through QA_JSON_REPORT or QA_JUNIT_REPORT.',
  '--update-snapshots':
    'baselines are written in the automate phase only (npm run lanes:visual -- --phase automate --update).',
};

/** The option an argument sets (`--workers` for `--workers=2` and `-j`), or null for a value. */
function optionName(arg) {
  if (!arg.startsWith('-')) return null;
  const name = arg.split('=')[0];
  return ALIASES[name] ?? name;
}

/** The `--grep` of a lane: its tag, and the user's pattern too when one narrows it. */
export function laneGrep(tag, narrowing = null) {
  const own = `${tag}(?![\\w-])`;
  return narrowing ? `(?=[\\s\\S]*${own})(?=[\\s\\S]*(?:${narrowing}))` : own;
}

/**
 * A lane's plan from its name and arguments: `{ name, tag, env, recovery, summary, listArgs,
 * runArgs }`, or `{ refusal, usage }`.
 */
export function planLane(name, args = []) {
  const lane = Object.hasOwn(LANES, name ?? '') ? LANES[name] : null;
  if (!lane) return { refusal: `unknown lane "${name ?? ''}".`, usage: true };
  const fixed = new Set(
    [...(lane.args ?? []), ...(lane.repeat ? ['--repeat-each'] : [])].map(optionName),
  );
  const rest = args[0] === '--' ? args.slice(1) : args;
  let repeat = lane.repeat ?? null;
  let narrowing = null;
  const forwarded = [];
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    const option = optionName(arg);
    const value = () => (arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : (rest[++i] ?? ''));
    if (option === '--repeat' && lane.repeat) {
      const raw = value();
      repeat = Number(raw);
      if (!Number.isInteger(repeat) || repeat < 1)
        return { refusal: `--repeat must be a whole number of at least 1, got "${raw}".` };
    } else if (option === '--grep') {
      narrowing = value();
      if (/^\/.*\/[gi]*$/.test(narrowing))
        return { refusal: '--grep takes a plain pattern here; the lane adds its tag to it.' };
    } else if (option && Object.hasOwn(REFUSED, option)) {
      return { refusal: `${option} is refused: ${REFUSED[option]}` };
    } else if (option === '--repeat') {
      return { refusal: `the ${name} lane does not take --repeat.` };
    } else if (fixed.has(option)) {
      return { refusal: `the ${name} lane sets ${option} itself.` };
    } else forwarded.push(arg);
  }
  const selection = ['--grep', laneGrep(lane.tag, narrowing), ...forwarded];
  return {
    name,
    tag: lane.tag,
    env: lane.env ?? {},
    recovery: lane.recovery === true,
    summary: lane.summary ?? null,
    // An empty selection is an answer here, not an error: the lane says so and exits 0.
    listArgs: ['test', '--list', '--pass-with-no-tests', ...selection],
    runArgs: [
      'test',
      ...selection,
      ...(lane.args ?? []),
      ...(repeat ? [`--repeat-each=${repeat}`] : []),
    ],
  };
}

const LANE_VARIABLES = [
  VISUAL_LANE_ENV,
  ...new Set(Object.values(LANES).flatMap((lane) => Object.keys(lane.env ?? {}))),
];

/** The environment of a lane's run: its own lane variables set, every other lane's cleared. */
export function laneEnvironment(plan, env = process.env) {
  const lane = { ...env };
  for (const variable of LANE_VARIABLES) delete lane[variable];
  return { ...lane, ...plan.env };
}

/** The tests a `--list` run printed, `{ project, title }`, without the preflight projects. */
export function listedTests(output) {
  return [...output.matchAll(/^\s*\[([^\]\r\n]+)\] › (.*)$/gm)]
    .map(([, project, title]) => ({ project, title: title.trim() }))
    .filter(({ project }) => !project.startsWith('preflight-'));
}

/** The packs of these device projects (`<pack>-<device>`), by the longest pack name that fits. */
export function packsOf(projects, packs) {
  const longestFirst = [...packs].sort((a, b) => b.length - a.length);
  const found = new Set();
  for (const project of projects) {
    const pack = longestFirst.find((name) => project.startsWith(`${name}-`));
    if (pack) found.add(pack);
  }
  return [...found].sort();
}

/**
 * The recovery of each selected pack, `{ recoveries: [{ pack, command, baseUrl, timeoutS }] }`, or
 * `{ refusal }` when a pack has no entry in the environment or no `recovery` in it. `environment` is
 * `activeEnvironment`'s result.
 */
export function recoveryPlan(packs, { source, name, packs: entries }, env = process.env) {
  const recoveries = [];
  for (const pack of packs) {
    const entry = entries[pack];
    const at = `app.environments.${name}.packs.${pack}`;
    if (!entry) return { refusal: `${source} has no ${at}: pack "${pack}" cannot run there.` };
    if (!entry.recovery?.command) {
      return {
        refusal:
          `pack "${pack}" has @destructive cases but ${source} gives no ${at}.recovery: ` +
          'nothing would bring the application back after them.',
      };
    }
    recoveries.push({
      pack,
      command: entry.recovery.command,
      baseUrl: (env[packVariable(pack, 'BASE_URL')] || entry.base_url).replace(/\/+$/, ''),
      timeoutS: entry.recovery.ready_timeout_s ?? 60,
    });
  }
  return { recoveries };
}

const CASE_ID = /\bTC-[A-Z][A-Z0-9]*-\d+\b/;

/** Every test of a Playwright JSON report, one per project and repetition. */
export function reportEntries(report) {
  const entries = [];
  const walk = (suite, titles) => {
    for (const child of suite.suites ?? []) walk(child, [...titles, child.title]);
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        entries.push({
          id: CASE_ID.exec(spec.title)?.[0] ?? [...titles, spec.title].filter(Boolean).join(' > '),
          project: test.projectName,
          tags: (spec.tags ?? []).map((tag) => (tag.startsWith('@') ? tag : `@${tag}`)),
          outcome: test.status,
          expected: test.expectedStatus,
          last: test.results?.at(-1)?.status ?? null,
          health: [...(test.annotations ?? []), ...(test.results?.at(-1)?.annotations ?? [])].some(
            (a) => a.type === 'page-health',
          ),
        });
      }
    }
  };
  for (const suite of report.suites ?? []) walk(suite, [suite.title]);
  return entries;
}

/** The report's errors outside any test (a worker's teardown, a global setup), as a line. */
function outsideTests(report) {
  const count = report.errors?.length ?? 0;
  return count ? [`errors outside any test: ${count}, shown in the run's output above`] : [];
}

/** `TC-X (project, project)` per case of a group, in the order the report gave them. */
function grouped(entries) {
  const byId = new Map();
  for (const { id, project } of entries) {
    if (!byId.has(id)) byId.set(id, []);
    if (!byId.get(id).includes(project)) byId.get(id).push(project);
  }
  return [...byId].map(([id, projects]) => `${id} (${projects.join(', ')})`);
}

/**
 * Which known gaps still fail as armed, which now pass and which fail for another reason. A test
 * without the tag (a preflight) counts only when it failed. `{ groups, lines, ok }`; ok when no gap
 * passed and nothing failed for another reason. `health` lists the gaps whose run the page health
 * guard found problems in: the guard only notes them on an armed case, so they are read here.
 */
export function summarizeKnownGaps(report) {
  const groups = { armed: [], passing: [], other: [], skipped: [] };
  const health = [];
  for (const entry of reportEntries(report)) {
    if (entry.health) health.push(entry);
    if (!entry.tags.includes(KNOWN_GAP_TAG)) {
      if (entry.outcome === 'unexpected') groups.other.push(entry);
    } else if (entry.outcome === 'skipped') groups.skipped.push(entry);
    // Ran to the end and passed; armed, Playwright reports it as "Expected to fail, but passed".
    else if (entry.last === 'passed') groups.passing.push(entry);
    else if (entry.outcome === 'expected' && entry.expected === 'failed') groups.armed.push(entry);
    else groups.other.push(entry);
  }
  const ids = Object.fromEntries(Object.entries(groups).map(([key, list]) => [key, grouped(list)]));
  const line = (label, list) => `${label}: ${list.length ? list.join(', ') : 'none'}`;
  return {
    groups: ids,
    health: grouped(health),
    lines: [
      line('still failing as armed (expected)', ids.armed),
      line('now passing (check the issue; if it is fixed, the arm and the tag go)', ids.passing),
      line('failing for another reason', ids.other),
      ...(ids.skipped.length ? [line('skipped', ids.skipped)] : []),
      ...(health.length ? [line('page health problems noted', grouped(health))] : []),
      ...outsideTests(report),
    ],
    ok: ids.passing.length === 0 && ids.other.length === 0 && !report.errors?.length,
  };
}

/**
 * How many repetitions of each quarantined case failed, per case and project. A test without the tag
 * (a preflight) counts only when it failed. `{ cases, lines, ok }`; ok when no repetition failed.
 */
export function summarizeFlakes(report) {
  const cases = new Map();
  const outside = [];
  for (const entry of reportEntries(report)) {
    if (!entry.tags.includes(QUARANTINE_TAG)) {
      if (entry.outcome === 'unexpected') outside.push(entry);
      continue;
    }
    if (entry.outcome === 'skipped') continue;
    if (!cases.has(entry.id)) cases.set(entry.id, new Map());
    const projects = cases.get(entry.id);
    const counts = projects.get(entry.project) ?? { failed: 0, runs: 0 };
    counts.runs += 1;
    if (entry.outcome !== 'expected') counts.failed += 1;
    projects.set(entry.project, counts);
  }
  const lines = [...cases].map(([id, projects]) => {
    const all = [...projects.values()];
    const failed = all.reduce((sum, c) => sum + c.failed, 0);
    const runs = all.reduce((sum, c) => sum + c.runs, 0);
    const each = [...projects].map(([project, c]) => `${project} ${c.failed}/${c.runs}`);
    return `${id}: ${failed} of ${runs} repetitions failed (${each.join(', ')})`;
  });
  if (outside.length) lines.push(`failing outside the lane: ${grouped(outside).join(', ')}`);
  lines.push(...outsideTests(report));
  const failing = [...cases.values()].some((p) => [...p.values()].some((c) => c.failed > 0));
  return { cases, lines, ok: !failing && outside.length === 0 && !report.errors?.length };
}

/** Run one pack's recovery and wait for its base URL; 0 when it came back. */
async function recover({ pack, command, baseUrl, timeoutS }, io) {
  io.out.log(`lanes: recovery of ${pack}: ${command}`);
  const result = io.shell(command);
  if (exitCodeOf(result) !== 0) {
    io.out.error(`lanes: the recovery of ${pack} failed (${describeExit(result)}).`);
    return 1;
  }
  if (!(await io.answers(baseUrl, timeoutS))) {
    io.out.error(
      `lanes: the recovery of ${pack} ended (exit 0), but ${baseUrl} did not answer within ${timeoutS} s.`,
    );
    return 1;
  }
  io.out.log(`lanes: recovery of ${pack}: exit 0, ${baseUrl} answers.`);
  return 0;
}

/**
 * Run a planned lane and return its exit code. `io` holds what touches the machine, replaced in
 * tests: `playwright(args, env, capture)` and `shell(command)` return a `spawnSync` result,
 * `answers(url, seconds)` whether the URL answered in time, `readJson(file)` the report or null,
 * `remove(file)`, `environment()` the active environment, `packs()` the app packs, `env`, `out`.
 */
export async function runLane(plan, io) {
  const env = laneEnvironment(plan, io.env);
  const listing = io.playwright(plan.listArgs, env, true);
  if (exitCodeOf(listing) !== 0) {
    io.out.error(`${listing.stdout ?? ''}${listing.stderr ?? ''}`.trim());
    io.out.error(`lanes: listing the ${plan.name} lane failed (${describeExit(listing)}).`);
    return 1;
  }
  const listed = listedTests(listing.stdout ?? '');
  if (listed.length === 0) {
    io.out.log(`lanes: ${plan.name}: no ${plan.tag} case in this selection; nothing ran.`);
    return 0;
  }
  let recoveries = [];
  if (plan.recovery) {
    const projects = new Set(listed.map(({ project }) => project));
    const planned = recoveryPlan(packsOf(projects, io.packs()), io.environment(), env);
    if (planned.refusal) {
      io.out.error(`lanes: refused: ${planned.refusal}`);
      return 2;
    }
    recoveries = planned.recoveries;
  }
  const report = resolve(
    io.root ?? REPO_ROOT,
    env.QA_JSON_REPORT || join('reports', 'lanes', `${plan.name}.json`),
  );
  // Every lane writes its own JSON report, so it never replaces the suite's, and the quality gate
  // can read the lanes of one run beside it.
  env.QA_JSON_REPORT = report;
  io.remove(report);
  io.out.log(`lanes: ${plan.name}: ${listed.length} test(s) selected.`);
  let code = 1;
  try {
    code = exitCodeOf(io.playwright(plan.runArgs, env, false));
  } finally {
    // Whatever the run did: the application stays broken for everyone else until it recovers.
    for (const recovery of recoveries) code = Math.max(code, await recover(recovery, io));
  }
  if (plan.summary) {
    const data = io.readJson(report);
    if (!data) {
      io.out.error(`lanes: no JSON report at ${report}; the run did not finish.`);
      return Math.max(code, 1);
    }
    const summary = plan.summary(data);
    io.out.log(`\nlanes: ${plan.name} summary`);
    for (const line of summary.lines) io.out.log(`  ${line}`);
    if (!summary.ok) code = Math.max(code, 1);
  }
  return code;
}

/** Whether `url` gives any HTTP answer within `seconds`; an error page is an answer. */
async function answers(url, seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(5_000) });
      return true;
    } catch {
      await new Promise((done) => setTimeout(done, 1_000));
    }
  }
  return false;
}

const PLAYWRIGHT_CLI = join(REPO_ROOT, 'node_modules', '@playwright', 'test', 'cli.js');

function machineIo() {
  return {
    root: REPO_ROOT,
    env: process.env,
    out: console,
    playwright: (args, env, capture) =>
      spawnSync(process.execPath, [PLAYWRIGHT_CLI, ...args], {
        cwd: REPO_ROOT,
        env,
        encoding: 'utf8',
        stdio: capture ? 'pipe' : 'inherit',
        maxBuffer: 64 * 1024 * 1024,
      }),
    shell: (command) => spawnSync(command, { cwd: REPO_ROOT, shell: true, stdio: 'inherit' }),
    answers,
    readJson: (file) => {
      try {
        return JSON.parse(readFileSync(file, 'utf8'));
      } catch {
        return null;
      }
    },
    remove: (file) => rmSync(file, { force: true }),
    environment: () => activeEnvironment(REPO_ROOT),
    packs: () => appPacks(REPO_ROOT),
  };
}

async function main() {
  const [name, ...args] = process.argv.slice(2);
  const plan = planLane(name, args);
  if (plan.refusal) {
    console.error(`lanes: refused: ${plan.refusal}`);
    if (plan.usage) console.error(USAGE);
    process.exit(2);
  }
  // Ctrl+C stops Playwright, not the recovery after it.
  if (plan.recovery) process.on('SIGINT', () => console.error('lanes: interrupted; recovering.'));
  process.exit(await runLane(plan, machineIo()));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
