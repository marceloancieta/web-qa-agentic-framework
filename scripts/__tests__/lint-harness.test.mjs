import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import { compareWithMarkers } from '../lib/lint.mjs';
import { FIXTURES, lintFile, lintHarness, RULES } from '../lint-harness.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'lint-harness.mjs');
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const rules = (findings) => findings.map((f) => f.rule);

test('self-test: the fixture tree yields exactly its marked findings, for every rule', () => {
  const findings = lintHarness(FIXTURES);
  assert.deepEqual(compareWithMarkers(FIXTURES, findings), { missed: [], unexpected: [] });
  assert.deepEqual([...new Set(rules(findings))].sort(), [...RULES].sort());
  const selfTest = run('--self-test');
  assert.equal(selfTest.status, 0, selfTest.stdout);
});

test('the repository has no findings', () => {
  assert.deepEqual(lintHarness(REPO_ROOT), []);
});

test('each rule keeps to its layers', () => {
  const css = "export const x = (page) => page.locator('.card');\n";
  assert.deepEqual(rules(lintFile(css, 'apps/shop/pages/a.ts')), ['css-without-reason']);
  assert.deepEqual(rules(lintFile(css, 'apps/shop/flows/a.ts')), ['css-without-reason']);
  assert.deepEqual(lintFile(css, 'apps/shop/mocks/a.ts'), [], 'mocks do not locate for specs');
  assert.deepEqual(lintFile(css, 'helpers/a.ts'), [], 'the core is not a pack layer');

  const wait = 'export const w = (page) => page.waitForTimeout(100);\n';
  assert.deepEqual(rules(lintFile(wait, 'apps/shop/specs/a.spec.ts')), ['fixed-wait']);
  assert.deepEqual(lintFile(wait, 'apps/shop/mocks/a.ts'), []);

  const untagged = "test('no layer', async () => {});\n";
  assert.deepEqual(rules(lintFile(untagged, 'apps/shop/specs/a.spec.ts')), ['layer-tag']);
  assert.deepEqual(lintFile(untagged, 'apps/shop/specs/helpers.ts'), [], 'not a spec file');
});

test('--root lints another tree and exits 1 on findings', () => {
  assert.equal(run('--root', FIXTURES).status, 1);
});
