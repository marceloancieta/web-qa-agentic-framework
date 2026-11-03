// The create-web-qa package (FUT-02): what it ships, how its documents keep their links, and the
// project it generates.
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { create, GITIGNORE, projectName } from '../../packages/create-web-qa/index.mjs';
import { linkRecords, PACKAGE_DIR, shippedFiles } from '../create-package.mjs';
import { REPO_ROOT } from '../lib/cli.mjs';
import { gitEnv } from '../lib/git.mjs';
import { FRAMEWORK_REPOSITORY } from '../lib/product.mjs';

const readJson = (path) => JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8'));

/**
 * shippedFiles reads `git ls-files`, so the tests of what ships need the tree to be a checkout of its
 * own. A Stryker sandbox (`npm run mutation`) is a copy under the ignored `.stryker-tmp/` of the
 * repository, where git lists nothing; there they are skipped.
 */
function notOwnCheckout() {
  const run = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: REPO_ROOT,
    env: gitEnv(),
    encoding: 'utf8',
  });
  if (run.status === 0 && resolve(run.stdout.trim()) === resolve(REPO_ROOT)) return false;
  return 'the tree is not a git checkout of its own, such as a Stryker sandbox';
}
const SHIPPED = { skip: notOwnCheckout() };

test('the package ships the product: these top-level entries, and nothing else', SHIPPED, () => {
  const top = [...new Set(shippedFiles().map((file) => file.split('/')[0]))].sort();
  assert.deepEqual(top, [
    '.actrc',
    '.claude',
    '.editorconfig',
    '.env.example',
    '.gitattributes',
    '.githooks',
    '.github',
    '.gitignore',
    '.nvmrc',
    '.prettierignore',
    '.prettierrc.json',
    'AGENTS.md',
    'CLAUDE.md',
    'Jenkinsfile',
    'LICENSE',
    'NOTICE',
    'README.md',
    'apps',
    'audit-known.json',
    'docker',
    'docs',
    'eslint.config.mjs',
    'fixtures',
    'helpers',
    'package-lock.json',
    'package.json',
    'playwright.config.ts',
    'qa-config.example.json',
    'schemas',
    'scripts',
    'stryker.config.mjs',
    'stryker.hooks.config.mjs',
    'tsconfig.json',
  ]);
});

test(
  'the product includes the agent setup, templates, core and gates, and leaves out the records',
  SHIPPED,
  () => {
    const files = new Set(shippedFiles());
    for (const file of [
      '.claude/rules/modes.md',
      '.claude/skills/qa-design/SKILL.md',
      '.claude/agents/ui-spec-reviewer.md',
      '.claude/hooks/secret-guard.mjs',
      '.claude/settings.json',
      'docs/templates/registry.md',
      'docs/guides/adopting.md',
      'docs/repository-settings.md',
      'helpers/devices.ts',
      'fixtures/index.ts',
      'scripts/lint-suite.mjs',
      'scripts/framework-update.mjs',
      '.github/workflows/ci.yml',
      'apps/juice-shop/app.json',
    ])
      assert.ok(files.has(file), `${file} is shipped`);
    const docs = [...files].filter((file) => file.startsWith('docs/'));
    for (const file of [...files])
      assert.ok(!file.startsWith(`${PACKAGE_DIR}/`), `${file}: the package's own source`);
    assert.ok(!docs.some((file) => file.startsWith('docs/adr/')), 'no decision of the framework');
    for (const file of [
      'docs/backlog.md',
      'CHANGELOG.md',
      'CONTRIBUTING.md',
      'SECURITY.md',
      'CODE_OF_CONDUCT.md',
      'scripts/__tests__/community-files.test.mjs',
    ])
      assert.ok(!files.has(file), `${file} is the framework's own`);
  },
);

test('links and paths into a development record point at the framework at the release tag', () => {
  const at = (path) => `${FRAMEWORK_REPOSITORY}/blob/v1.2.3/${path}`;
  const text = [
    'See [the backlog](docs/backlog.md#v020) and [ADR 0005](../adr/0005-layers.md).',
    'Owner: `docs/backlog.md`. Kept: `docs/architecture.md`, [guide](guides/running-tests.md).',
    'A folder `docs/adr/` and a [site](https://example.com/docs/backlog.md) stay.',
  ].join('\n');
  assert.equal(
    linkRecords(text, 'docs/guides/x.md', 'v1.2.3'),
    [
      `See [the backlog](docs/backlog.md#v020) and [ADR 0005](${at('docs/adr/0005-layers.md')}).`,
      `Owner: [docs/backlog.md](${at('docs/backlog.md')}). Kept: \`docs/architecture.md\`, [guide](guides/running-tests.md).`,
      'A folder `docs/adr/` and a [site](https://example.com/docs/backlog.md) stay.',
    ].join('\n'),
  );
  // From the root, the same relative link is a record.
  assert.equal(
    linkRecords('[backlog](docs/backlog.md#v020)', 'AGENTS.md', 'v1.2.3'),
    `[backlog](${at('docs/backlog.md')}#v020)`,
  );
});

test('the package is the framework release: same version, its repository, its bin and files', () => {
  const manifest = readJson(`${PACKAGE_DIR}/package.json`);
  assert.equal(manifest.name, 'create-web-qa');
  assert.equal(manifest.version, readJson('package.json').version);
  assert.equal(manifest.repository.url, FRAMEWORK_REPOSITORY);
  assert.deepEqual(manifest.bin, { 'create-web-qa': 'index.mjs' });
  assert.deepEqual(manifest.files, ['index.mjs', 'template/']);
  assert.equal(readJson('package.json').scripts['create:pack'], 'node scripts/create-package.mjs');
});

/** A template folder like the one the package carries, small. */
function template() {
  const dir = mkdtempSync(join(tmpdir(), 'template-'));
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'web-qa-agentic-framework', version: '9.9.9', scripts: { gates: 'x' } }),
  );
  writeFileSync(join(dir, GITIGNORE), 'node_modules/\n');
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'docs', 'a.md'), '# A\n');
  return dir;
}

test('a project is created from the template, named after its folder, with its release recorded', () => {
  const target = join(mkdtempSync(join(tmpdir(), 'created-')), 'Shop QA');
  const { code, lines } = create(template(), target, {
    version: '0.2.0',
    repository: FRAMEWORK_REPOSITORY,
  });
  assert.equal(code, 0, lines.join('\n'));
  assert.equal(readFileSync(join(target, '.gitignore'), 'utf8'), 'node_modules/\n');
  assert.ok(!existsSync(join(target, GITIGNORE)));
  assert.ok(existsSync(join(target, 'docs', 'a.md')));
  assert.deepEqual(JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')), {
    name: 'shop-qa',
    version: '0.0.0',
    scripts: { gates: 'x' },
    private: true,
  });
  assert.deepEqual(JSON.parse(readFileSync(join(target, '.web-qa.json'), 'utf8')), {
    repository: FRAMEWORK_REPOSITORY,
    release: 'v0.2.0',
  });
  assert.match(lines[0], /from web-qa v0\.2\.0/);
});

test('a folder that holds files is refused, an empty one is used, and a name is always valid', () => {
  const options = { version: '0.2.0', repository: FRAMEWORK_REPOSITORY };
  const used = mkdtempSync(join(tmpdir(), 'used-'));
  writeFileSync(join(used, 'notes.txt'), 'mine\n');
  assert.equal(create(template(), used, options).code, 1);
  assert.equal(readFileSync(join(used, 'notes.txt'), 'utf8'), 'mine\n');
  assert.equal(create(template(), mkdtempSync(join(tmpdir(), 'empty-')), options).code, 0);
  assert.equal(create(template(), undefined, options).code, 2);
  assert.equal(projectName('/tmp/My Tests!'), 'my-tests');
  assert.equal(projectName('/tmp/___'), 'web-qa-project');
});
