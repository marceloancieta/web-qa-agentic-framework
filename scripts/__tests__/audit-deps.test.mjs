import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { advisoriesOf, auditFindings, KNOWN_FILE } from '../audit-deps.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'audit-deps.mjs');
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

const MINIMATCH = 'GHSA-g3hv-75wg-m249';
const GLOB = 'GHSA-3g3m-2fjr-6pw4';
const advisory = (id, name, severity = 'moderate') => ({
  source: 1,
  name,
  title: `${name} advisory`,
  url: `https://github.com/advisories/${id}`,
  severity,
  range: '<99.0.0',
});

/** An `npm audit --json` report (format 2): minimatch and glob advisories, and their dependents. */
const REPORT = {
  auditReportVersion: 2,
  vulnerabilities: {
    minimatch: { name: 'minimatch', severity: 'moderate', via: [advisory(MINIMATCH, 'minimatch')] },
    glob: { name: 'glob', severity: 'moderate', via: [advisory(GLOB, 'glob'), 'minimatch'] },
    eslint: { name: 'eslint', severity: 'moderate', via: ['minimatch'] },
  },
};
const entry = (advisoryId, pkg, expires = '2026-12-01') => ({
  advisory: advisoryId,
  package: pkg,
  reason: 'no fix the dependents accept yet',
  expires,
});
const ON = '2026-11-01';
const rulesOf = (findings) => findings.map((f) => `${f.advisory} ${f.rule}`).sort();

test('advisories are read once per GHSA id; dependents that only point at one are not', () => {
  assert.deepEqual([...advisoriesOf(REPORT).keys()].sort(), [GLOB, MINIMATCH]);
  assert.throws(() => advisoriesOf({ error: { summary: 'network down' } }), /network down/);
});

test('every advisory listed and in date: clean', () => {
  const known = [entry(MINIMATCH, 'minimatch'), entry(GLOB, 'glob')];
  assert.deepEqual(auditFindings(REPORT, known, ON), []);
  assert.deepEqual(auditFindings(REPORT, known, '2026-12-01'), [], 'the expiry day still counts');
});

test('a new advisory, an expired entry and a stale entry are findings', () => {
  const stale = 'GHSA-xxxx-xxxx-xxxx'.replace(/x/g, '2');
  assert.deepEqual(
    rulesOf(
      auditFindings(
        REPORT,
        [entry(MINIMATCH, 'minimatch', '2026-10-31'), entry(stale, 'follow-redirects')],
        ON,
      ),
    ),
    [`${GLOB} new-advisory`, `${MINIMATCH} expired`, `${stale} stale`].sort(),
  );
  assert.deepEqual(auditFindings({ vulnerabilities: {} }, [], ON), [], 'no advisory, no entry');
});

test('a malformed entry is a finding and does not excuse its advisory', () => {
  const findings = auditFindings(
    REPORT,
    [
      { ...entry(MINIMATCH, 'minimatch'), reason: ' ' },
      { ...entry(GLOB, 'glob'), expires: '1/12/2026' },
      { ...entry('CVE-2026-0001', 'glob') },
      entry(GLOB, 'minimatch'),
    ],
    ON,
  );
  assert.deepEqual(rulesOf(findings), [
    'CVE-2026-0001 malformed',
    `${GLOB} malformed`, // its own entry has a bad date
    `${GLOB} malformed`, // the entry listed for minimatch names the glob advisory
    `${MINIMATCH} malformed`,
    `${MINIMATCH} new-advisory`,
  ]);
  assert.deepEqual(rulesOf(auditFindings(REPORT, {}, ON)).slice(0, 1), ['- malformed']);
});

test('the CLI: exit 0 clean, 1 with findings, 2 when the report cannot be read', () => {
  const dir = mkdtempSync(join(tmpdir(), 'audit-deps-'));
  const write = (name, value) => {
    const file = join(dir, name);
    writeFileSync(file, JSON.stringify(value));
    return file;
  };
  const report = write('report.json', REPORT);
  const known = write('known.json', [entry(MINIMATCH, 'minimatch', '2999-01-01')]);

  const findings = run('--report', report, '--known', known);
  assert.equal(findings.status, 1);
  assert.match(findings.stdout, new RegExp(`${GLOB} {2}new-advisory`));

  const all = write('all.json', [
    entry(MINIMATCH, 'minimatch', '2999-01-01'),
    entry(GLOB, 'glob', '2999-01-01'),
  ]);
  const clean = run('--report', report, '--known', all);
  assert.equal(clean.status, 0);
  assert.match(clean.stdout, /audit-deps: clean/);

  const broken = run(
    '--report',
    write('error.json', { error: { code: 'ENOTFOUND' } }),
    '--known',
    all,
  );
  assert.equal(broken.status, 2);
  assert.match(broken.stderr, /no vulnerabilities section: ENOTFOUND/);
});

test('the repository list is well formed', () => {
  const known = JSON.parse(readFileSync(KNOWN_FILE, 'utf8'));
  const findings = auditFindings({ vulnerabilities: {} }, known, ON);
  assert.deepEqual(
    findings.filter((f) => f.rule === 'malformed'),
    [],
    'every entry has a GHSA id, a package, a reason and an expiry',
  );
});
