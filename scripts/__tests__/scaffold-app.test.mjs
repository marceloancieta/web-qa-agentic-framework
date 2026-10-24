import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintFile } from '../lint-layers.mjs';
import { configEntry, planOptions, scaffoldFiles, writeScaffold } from '../scaffold-app.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'scaffold-app.mjs');
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const plan = planOptions({
  name: 'book-store',
  'base-url': 'http://localhost:8080/',
  'test-id-attribute': 'data-test',
  'login-path': '/login',
});

test('the plan: checked options, a title from the name, the base URL without a trailing slash', () => {
  assert.equal(plan.title, 'Book Store');
  assert.equal(plan.baseUrl, 'http://localhost:8080');
  assert.equal(plan.version, '0.0.0');
  for (const [values, problem] of [
    [{ name: 'Book', 'base-url': 'http://x.test' }, /--name/],
    [{ name: 'book', 'base-url': 'localhost:8080' }, /--base-url/],
    [{ name: 'book', 'base-url': 'http://x.test', version: 'v 1' }, /--version/],
    [
      { name: 'book', 'base-url': 'http://x.test', 'test-id-attribute': '[data-test]' },
      /--test-id/,
    ],
    [{ name: 'book', 'base-url': 'http://x.test', 'login-path': 'login' }, /--login-path/],
  ]) {
    assert.throws(() => planOptions(values), problem);
  }
});

test('the skeleton keeps to the layers and its manifest carries the options', () => {
  const files = Object.fromEntries(scaffoldFiles(plan));
  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith('.ts')) assert.deepEqual(lintFile(content, path), [], path);
  }
  const manifest = JSON.parse(files['apps/book-store/app.json']);
  assert.equal(manifest.name, 'book-store');
  assert.equal(manifest.testIdAttribute, 'data-test');
  assert.equal(manifest.login_path, '/login');
  assert.deepEqual(JSON.parse(files['apps/book-store/a11y-known.json']), []);
  assert.match(files['apps/book-store/fixtures.ts'], /cannot sign "\$\{role\}" in yet/);
});

test('the qa-config entry names variables, never values, and starts read-only', () => {
  const entry = configEntry(plan)['book-store'];
  assert.equal(entry.allow_writes, false);
  assert.deepEqual(entry.actors.user, {
    account: 'existing',
    username_env: 'BOOK_STORE_USER',
    password_env: 'BOOK_STORE_PASSWORD',
  });
});

test('writing creates every file once and never overwrites a pack', () => {
  const root = mkdtempSync(join(tmpdir(), 'scaffold-'));
  const written = writeScaffold(plan, root);
  assert.equal(written.length, scaffoldFiles(plan).length);
  assert.ok(written.every((path) => existsSync(join(root, path))));
  assert.match(readFileSync(join(root, 'apps/book-store/README.md'), 'utf8'), /# Book Store pack/);
  assert.throws(() => writeScaffold(plan, root), /already exists; a pack is never overwritten/);
});

test('the CLI plans without writing, and refuses bad options with exit 2', () => {
  const planned = run('--name', 'book-store', '--base-url', 'http://localhost:8080');
  assert.equal(planned.status, 0);
  assert.match(planned.stdout, /nothing written; add --write/);
  assert.match(planned.stdout, /apps\/book-store\/specs\/smoke\/home\.spec\.ts/);
  assert.equal(existsSync(join(import.meta.dirname, '..', '..', 'apps', 'book-store')), false);
  assert.equal(run('--name', 'Bad').status, 2);
});
