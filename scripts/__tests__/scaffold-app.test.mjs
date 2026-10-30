import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { lintFile as lintHarness } from '../lint-harness.mjs';
import { lintFile } from '../lint-layers.mjs';
import {
  configEntry,
  packSkill,
  planOptions,
  scaffoldFiles,
  writeScaffold,
} from '../scaffold-app.mjs';

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

test('the skeleton sweeps its own app maps, as thin as the worked pack', () => {
  const files = Object.fromEntries(scaffoldFiles(plan));
  const sweep = files['apps/book-store/specs/a11y/sweep.spec.ts'];
  assert.match(sweep, /sweepPlan\('book-store'\)/);
  assert.match(sweep, /tag: \['@regression', '@a11y-sweep'\]/);
  assert.match(sweep, /await a11y\.expectNoNewViolations\(page\)/);
  assert.deepEqual(lintHarness(sweep, 'apps/book-store/specs/a11y/sweep.spec.ts'), []);
  const worked = readFileSync(
    join(import.meta.dirname, '..', '..', 'apps', 'juice-shop', 'specs', 'a11y', 'sweep.spec.ts'),
    'utf8',
  );
  assert.equal(sweep.replace("'book-store'", "'juice-shop'"), worked.replace(/\r\n/g, '\n'));
});

test('the pack skill is the template example with the pack filled in', () => {
  const skill = Object.fromEntries(scaffoldFiles(plan))['.claude/skills/book-store-ui/SKILL.md'];
  assert.match(skill, /^---\nname: book-store-ui\ndescription: Facts about Book Store /);
  assert.match(skill, /^# Book Store$/m);
  assert.match(skill, /`apps\/book-store\/docs\/app-notes\.md`/);
  assert.doesNotMatch(skill, /<pack>|<application title>|```/i);
  assert.throws(() => packSkill(plan, '# A template\n\nNo example.\n'), /no ```markdown example/);
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

test('an existing pack skill is never overwritten either', () => {
  const root = mkdtempSync(join(tmpdir(), 'scaffold-'));
  const skill = join(root, '.claude/skills/book-store-ui/SKILL.md');
  mkdirSync(dirname(skill), { recursive: true });
  writeFileSync(skill, 'kept\n');
  assert.throws(
    () => writeScaffold(plan, root),
    /\.claude\/skills\/book-store-ui\/SKILL\.md already exists/,
  );
  assert.equal(readFileSync(skill, 'utf8'), 'kept\n');
  assert.equal(existsSync(join(root, 'apps/book-store')), false);
});

test('the CLI plans without writing, and refuses bad options with exit 2', () => {
  const planned = run('--name', 'book-store', '--base-url', 'http://localhost:8080');
  assert.equal(planned.status, 0);
  assert.match(planned.stdout, /nothing written; add --write/);
  assert.match(planned.stdout, /apps\/book-store\/specs\/smoke\/home\.spec\.ts/);
  assert.equal(existsSync(join(import.meta.dirname, '..', '..', 'apps', 'book-store')), false);
  assert.equal(run('--name', 'Bad').status, 2);
});
