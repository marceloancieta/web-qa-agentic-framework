#!/usr/bin/env node
/**
 * `npm run audit:deps`: `npm audit` held clean, with a reviewed and expiring list of exceptions.
 *
 * An advisory sometimes has no safe fix yet: the fixed version is a new major that the packages
 * depending on it have not adopted, or it is younger than the cooldown Dependabot keeps. Such an
 * advisory goes to `audit-known.json` with its GHSA id, the package, the reason and an expiry date,
 * the way a known accessibility violation goes to a pack's `a11y-known.json`. Findings:
 *
 *   new-advisory  an advisory the list does not name
 *   expired       an advisory still reported after its entry's expiry date
 *   stale         an entry whose advisory is no longer reported: remove it
 *   malformed     an entry without a GHSA id, a package, a reason or a YYYY-MM-DD expiry, or whose
 *                 package is not the one the advisory is about
 *
 * It needs the npm registry, and its outcome changes without a commit when an advisory is published,
 * so it runs as a CI step of its own and not inside `npm run gates`.
 *
 * Usage:
 *   node scripts/audit-deps.mjs [--known <file>] [--report <npm audit --json output>]
 * Exit codes: 0 clean; 1 findings; 2 the audit could not run or its output could not be read.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './lib/cli.mjs';
import { describeExit, spawnFailure } from './lib/spawn.mjs';

export const TOOL = 'audit-deps';
export const KNOWN_FILE = join(REPO_ROOT, 'audit-known.json');

const GHSA = /^GHSA(?:-[23456789cfghjmpqrvwx]{4}){3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today as YYYY-MM-DD in UTC, the format of an expiry date. */
export const today = () => new Date().toISOString().slice(0, 10);

/**
 * The advisories of an `npm audit --json` report (format 2), one per GHSA id.
 * @returns {Map<string, { advisory: string, package: string, severity: string, title: string }>}
 */
export function advisoriesOf(report) {
  if (!report || typeof report.vulnerabilities !== 'object') {
    throw new Error(
      `the npm audit output has no vulnerabilities section${report?.error ? `: ${report.error.summary ?? report.error.code}` : ''}`,
    );
  }
  const advisories = new Map();
  for (const vulnerability of Object.values(report.vulnerabilities)) {
    for (const source of vulnerability.via ?? []) {
      if (typeof source === 'string') continue; // a package that only depends on a vulnerable one
      const advisory = /GHSA(?:-\w{4}){3}/i.exec(source.url ?? '')?.[0];
      if (!advisory || advisories.has(advisory)) continue;
      advisories.set(advisory, {
        advisory,
        package: source.name,
        severity: source.severity,
        title: source.title,
      });
    }
  }
  return advisories;
}

/** What is wrong with one entry of the list, or null. */
function entryProblem(entry) {
  if (!entry || typeof entry !== 'object') return 'is not an object';
  if (!GHSA.test(entry.advisory ?? '')) return 'has no GHSA id in "advisory"';
  if (!entry.package) return 'names no "package"';
  if (!entry.reason?.trim()) return 'gives no "reason"';
  if (!DATE.test(entry.expires ?? '')) return 'has no YYYY-MM-DD "expires"';
  return null;
}

/**
 * Findings of an audit report against the list of known advisories.
 * @returns {{ rule: string, advisory: string, message: string }[]}
 */
export function auditFindings(report, known, on = today()) {
  const advisories = advisoriesOf(report);
  const findings = [];
  const add = (rule, advisory, message) => findings.push({ rule, advisory, message });
  if (!Array.isArray(known)) {
    add('malformed', '-', 'the list of known advisories is not a JSON array');
    known = [];
  }
  const listed = new Map();
  known.forEach((entry, index) => {
    const problem = entryProblem(entry);
    if (problem) add('malformed', entry?.advisory ?? `entry ${index}`, `entry ${index} ${problem}`);
    else listed.set(entry.advisory, entry);
  });

  for (const found of advisories.values()) {
    const entry = listed.get(found.advisory);
    const what = `${found.package} (${found.severity}): ${found.title}`;
    if (!entry) add('new-advisory', found.advisory, `${what}; fix it or list it with a reason`);
    else if (entry.package !== found.package)
      add(
        'malformed',
        found.advisory,
        `listed for ${entry.package}, but the advisory is about ${found.package}`,
      );
    else if (entry.expires < on)
      add('expired', found.advisory, `${what}; the exception expired on ${entry.expires}`);
  }
  for (const entry of listed.values()) {
    if (!advisories.has(entry.advisory)) {
      add('stale', entry.advisory, `${entry.package} is no longer reported; remove the entry`);
    }
  }
  return findings;
}

/** The parsed output of `npm audit --json` in `cwd`. */
export function runNpmAudit(cwd = REPO_ROOT) {
  // A fixed command through the shell, as lanes.mjs does, so `npm` resolves to npm.cmd on Windows.
  const result = spawnSync('npm audit --json', {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: true,
  });
  // npm audit exits 1 when it finds advisories, so the exit code alone says nothing; the JSON does.
  if (spawnFailure(result)) throw new Error(`npm audit could not run: ${describeExit(result)}`);
  try {
    return JSON.parse(result.stdout);
  } catch {
    const detail = (result.stderr ?? '').trim() || describeExit(result);
    throw new Error(`npm audit gave no JSON: ${detail}`);
  }
}

function main() {
  const { values } = parseArgs({
    options: { known: { type: 'string' }, report: { type: 'string' } },
  });
  const known = JSON.parse(readFileSync(values.known ?? KNOWN_FILE, 'utf8'));
  const report = values.report ? JSON.parse(readFileSync(values.report, 'utf8')) : runNpmAudit();
  const findings = auditFindings(report, known);
  for (const { rule, advisory, message } of findings) {
    console.log(`${advisory}  ${rule}  ${message}`);
  }
  console.log(`${TOOL}: ${findings.length === 0 ? 'clean' : `${findings.length} finding(s)`}.`);
  process.exitCode = findings.length === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(`${TOOL}: ${error.message}`);
    process.exitCode = 2;
  }
}
