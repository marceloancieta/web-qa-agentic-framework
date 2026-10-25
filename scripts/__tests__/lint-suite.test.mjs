import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coverageStatus } from '../coverage-status.mjs';
import { REPO_ROOT } from '../lib/cli.mjs';
import { compareWithMarkers } from '../lib/lint.mjs';
import { parseRegistry } from '../lib/registry.mjs';
import { FIXTURES, lintSuite, RULES } from '../lint-suite.mjs';
import { traceability } from '../traceability.mjs';

const run = (script, ...args) =>
  spawnSync(process.execPath, [join(import.meta.dirname, '..', script), ...args], {
    encoding: 'utf8',
  });

test('self-test: the fixture tree yields exactly its marked findings, for every rule', () => {
  const findings = lintSuite(FIXTURES);
  assert.deepEqual(compareWithMarkers(FIXTURES, findings), { missed: [], unexpected: [] });
  assert.deepEqual([...new Set(findings.map((f) => f.rule))].sort(), [...RULES].sort());
  assert.equal(run('lint-suite.mjs', '--self-test').status, 0);
});

test('the repository has no findings', () => {
  assert.deepEqual(lintSuite(REPO_ROOT), []);
});

test('missing header keys are reported where they belong: the file start, or the dimensions block', () => {
  const { problems } = parseRegistry(
    '---\nfeature: LOGIN\ndimensions:\n  security: applies\n---\n## Cases\n',
  );
  const byLine = (line) => problems.filter((p) => p.line === line).map((p) => p.message);
  assert.ok(byLine(1).some((m) => m.includes('`title` is required')));
  assert.ok(byLine(1).some((m) => m.includes('`routes` must list')));
  assert.ok(byLine(3).some((m) => m.includes('dimensions.a11y is missing')));
  assert.ok(problems.some((p) => p.message.includes('the cases table header must be')));
});

test('coverage status counts statuses, automation and dimension cases per registry', () => {
  const status = coverageStatus(FIXTURES);
  const login = status.packs[0].registries.find((r) => r.file.endsWith('login.md'));
  assert.equal(login.feature, 'LOGIN');
  assert.equal(login.automated, login.byStatus.automated + login.byStatus.published);
  assert.equal(login.dimensions.a11y, 0);
  assert.ok(login.dimensions.security >= 2);
  assert.equal(status.findings.length, lintSuite(FIXTURES).length);
  const reportOnly = run('coverage-status.mjs', '--root', FIXTURES, '--json', '--report-only');
  assert.equal(reportOnly.status, 0);
  assert.equal(JSON.parse(reportOnly.stdout).packs[0].pack, 'shop');
  assert.equal(run('coverage-status.mjs', '--root', FIXTURES).status, 1);
});

function treeWith(registry) {
  const root = mkdtempSync(join(tmpdir(), 'trace-'));
  mkdirSync(join(root, 'apps', 'shop', 'registry'), { recursive: true });
  writeFileSync(join(root, 'apps', 'shop', 'registry', 'search.md'), registry);
  return root;
}

const DIMENSIONS_BLOCK = [
  'dimensions:',
  ...['responsive', 'perf', 'security', 'layout', 'navigation', 'a11y', 'content'].map(
    (name) => `  ${name}: 'n/a: not in this example'`,
  ),
].join('\n');

test('traceability: an uncovered requirement and one covered only by mocks are findings', () => {
  const root = treeWith(`---
feature: SEARCH
title: Search
routes: [/#/search]
${DIMENSIONS_BLOCK}
requirements:
  - { id: REQ-SEARCH-01, text: Results match the query }
  - { id: REQ-SEARCH-02, text: A failing search says so }
  - { id: REQ-SEARCH-03, text: The query is kept in the URL }
---
## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-SEARCH-01 | finds a product | REQ-SEARCH-01 | use-case | high | @smoke | all | draft | | |
| TC-SEARCH-02 | shows the error of a failed search | REQ-SEARCH-02 | error-guessing | medium | @regression @mocked | all | draft | | |
`);
  const { rows, findings } = traceability(root);
  assert.deepEqual(
    rows.map((r) => [r.requirement, r.cases]),
    [
      ['REQ-SEARCH-01', ['TC-SEARCH-01']],
      ['REQ-SEARCH-02', ['TC-SEARCH-02']],
      ['REQ-SEARCH-03', []],
    ],
  );
  assert.deepEqual(
    findings.map((f) => `${f.rule} ${f.line}`),
    ['mocked-only 13', 'uncovered-requirement 13'],
  );
  assert.equal(run('traceability.mjs', '--root', root).status, 1);
  assert.equal(run('traceability.mjs').status, 0);
});
