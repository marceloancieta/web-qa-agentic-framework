import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import { compareWithMarkers } from '../lib/lint.mjs';
import { FIXTURES, lintFile, lintLayers, RULES } from '../lint-layers.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'lint-layers.mjs');
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const rules = (findings) => findings.map((f) => f.rule);

test('self-test: the fixture tree yields exactly its marked findings, for every rule', () => {
  const findings = lintLayers(FIXTURES);
  assert.deepEqual(compareWithMarkers(FIXTURES, findings), { missed: [], unexpected: [] });
  assert.deepEqual([...new Set(rules(findings))].sort(), [...RULES].sort());
  const selfTest = run('--self-test');
  assert.equal(selfTest.status, 0, selfTest.stdout);
  assert.match(selfTest.stdout, /self-test: exact/);
});

test('the repository has no findings', () => {
  assert.deepEqual(lintLayers(REPO_ROOT), []);
});

test('--root lints another tree and exits 1 on findings', () => {
  const result = run('--root', FIXTURES);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /lint-layers: \d+ finding\(s\)\./);
});

test('each rule applies to its own layer only', () => {
  const packImport = "import { HomePage } from '../apps/shop/pages/home-page';\n";
  assert.deepEqual(rules(lintFile(packImport, 'helpers/x.ts')), ['core-imports-pack']);
  // Resolved from the file: one level up from scripts/__tests__ is scripts/, not the root.
  assert.deepEqual(lintFile(packImport, 'scripts/__tests__/x.test.mjs'), []);
  assert.deepEqual(lintFile(packImport, 'apps/shop/flows/x.ts'), []);

  const spec = 'apps/shop/specs/search/search.spec.ts';
  const locator = "test('t', async ({ page }) => { await page.locator('#q').fill('x'); });\n";
  assert.deepEqual(rules(lintFile(locator, spec)), ['spec-builds-locator']);
  assert.deepEqual(lintFile(locator, 'apps/shop/pages/search-page.ts'), []);
  assert.deepEqual(lintFile(locator, 'apps/shop/specs/helpers.ts'), [], 'not a spec file');

  const assertion = "expect(this.page.getByRole('alert')).toBeVisible();\n";
  for (const layer of ['pages', 'components', 'flows']) {
    assert.deepEqual(rules(lintFile(assertion, `apps/shop/${layer}/a.ts`)), [
      'page-object-asserts',
    ]);
  }
  assert.deepEqual(lintFile(assertion, 'apps/shop/api/a.ts'), []);
  assert.deepEqual(lintFile(assertion, 'docs/a.ts'), []);
});

test('a browser context is not a request context', () => {
  const spec = 'apps/shop/specs/a.spec.ts';
  const browserContext = "test('t', async ({ browser }) => { await browser.newContext(); });\n";
  assert.deepEqual(lintFile(browserContext, spec), []);
  const requestContext =
    "test('t', async ({ playwright }) => { await playwright.request.newContext(); });\n";
  assert.deepEqual(rules(lintFile(requestContext, spec)), ['spec-sends-request']);
});
