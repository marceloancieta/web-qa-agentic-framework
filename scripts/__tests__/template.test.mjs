// The repository as a template (FUT-13): what is product, taking a later release into a copy that
// shares no history with the framework, and removing an example pack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  frameworkUpdate,
  isLater,
  isUpdated,
  readRecord,
  releaseOf,
} from '../framework-update.mjs';
import { gitEnv } from '../lib/git.mjs';
import { DEVELOPMENT_RECORDS, isAdopterOwned, isUnder } from '../lib/product.mjs';
import { configWithout, coreReaders, markdownWithout, removeApp } from '../remove-app.mjs';

function git(dir, ...args) {
  const run = spawnSync(
    'git',
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args],
    { cwd: dir, env: gitEnv(), encoding: 'utf8' },
  );
  assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`);
  return run.stdout;
}

/** Write `files` ({ path: text }, null removes) under `dir`. */
function write(dir, files) {
  for (const [path, text] of Object.entries(files)) {
    const full = join(dir, path);
    if (text === null) rmSync(full, { force: true });
    else {
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, text);
    }
  }
}

/** A new repository holding `files`, committed. */
function repoWith(files, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  git(dir, 'init', '-q', '--initial-branch=main');
  write(dir, files);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'initial');
  return dir;
}

const commitAll = (dir, message) => {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', message);
};

test('product, development records and adopter-owned paths are told apart', () => {
  for (const path of ['docs/backlog.md', 'CHANGELOG.md', 'docs/adr/0001-x.md', 'CONTRIBUTING.md'])
    assert.ok(isUnder(path, DEVELOPMENT_RECORDS), path);
  for (const path of ['docs/backlogs.md', 'docs/adrx.md', 'AGENTS.md', 'docs/guides/adopting.md'])
    assert.ok(!isUnder(path, DEVELOPMENT_RECORDS), path);
  assert.ok(isAdopterOwned('apps/shop/app.json'));
  assert.ok(isAdopterOwned('.claude/skills/shop-ui/SKILL.md'));
  assert.ok(!isAdopterOwned('.claude/skills/qa-run/SKILL.md'));
  assert.ok(!isAdopterOwned('apps.md'));
  assert.ok(isUpdated('scripts/lib/tags.mjs'));
  assert.ok(!isUpdated('docs/backlog.md'));
  assert.ok(!isUpdated('apps/shop/specs/a.spec.ts'));
});

test('releases are v<x.y.z> tags compared by number', () => {
  assert.deepEqual(releaseOf('v0.10.2'), [0, 10, 2]);
  assert.equal(releaseOf('0.1.0'), null);
  assert.equal(releaseOf('v0.1'), null);
  assert.ok(isLater('v0.10.0', 'v0.9.9'));
  assert.ok(isLater('v1.0.0', 'v0.99.0'));
  assert.ok(!isLater('v0.2.0', 'v0.2.0'));
  assert.ok(!isLater('v0.1.9', 'v0.2.0'));
});

/**
 * The framework at v0.1.0 and v0.2.0, and a copy made from v0.1.0 with GitHub's "Use this
 * template": the same files in a history of its own, then changed by the project.
 */
function upstreamAndCopy() {
  const v1 = {
    'scripts/lib/a.mjs': 'export const a = 1;\n',
    'scripts/lib/b.mjs': 'line one\nline two\nline three\n',
    'scripts/old.mjs': 'export const old = true;\n',
    'docs/backlog.md': '# Backlog v1\n',
    'apps/shop/app.json': '{ "name": "shop" }\n',
  };
  const upstream = repoWith(v1, 'framework-');
  git(upstream, 'tag', 'v0.1.0');
  write(upstream, {
    'scripts/lib/a.mjs': 'export const a = 2;\n',
    'scripts/lib/b.mjs': 'line one\nline two\nline three, improved\n',
    'scripts/lib/c.mjs': 'export const c = 3;\n',
    'scripts/old.mjs': null,
    'docs/backlog.md': '# Backlog v2\n',
    'docs/adr/0002-new.md': '# A decision\n',
    'apps/shop/app.json': '{ "name": "shop", "version": "2" }\n',
  });
  commitAll(upstream, 'v0.2.0');
  git(upstream, 'tag', 'v0.2.0');
  const copy = repoWith(v1, 'copy-');
  write(copy, {
    'scripts/lib/b.mjs': 'line one, ours\nline two\nline three\n',
    'apps/shop/app.json': '{ "name": "our-shop" }\n',
  });
  commitAll(copy, 'our changes');
  return { upstream, copy };
}

test('an update plans the product changes between two releases and writes nothing', () => {
  const { upstream, copy } = upstreamAndCopy();
  const { code, lines } = frameworkUpdate(copy, {
    to: 'v0.2.0',
    from: 'v0.1.0',
    repository: upstream,
  });
  assert.equal(code, 0, lines.join('\n'));
  assert.deepEqual(lines.slice(0, 5), [
    'v0.1.0 -> v0.2.0: 4 product file(s) change',
    '  M scripts/lib/a.mjs',
    '  M scripts/lib/b.mjs',
    '  A scripts/lib/c.mjs',
    '  D scripts/old.mjs',
  ]);
  assert.equal(readFileSync(join(copy, 'scripts/lib/a.mjs'), 'utf8'), 'export const a = 1;\n');
  assert.equal(git(copy, 'status', '--porcelain'), '');
});

test('an update applies the product changes, keeps the project changes and records the release', () => {
  const { upstream, copy } = upstreamAndCopy();
  const { code, lines } = frameworkUpdate(copy, {
    to: 'v0.2.0',
    from: 'v0.1.0',
    repository: upstream,
    write: true,
  });
  assert.equal(code, 0, lines.join('\n'));
  const read = (path) => readFileSync(join(copy, path), 'utf8');
  assert.equal(read('scripts/lib/a.mjs'), 'export const a = 2;\n');
  // A three-way merge: the framework's change and the project's own, on other lines, both stay.
  assert.equal(read('scripts/lib/b.mjs'), 'line one, ours\nline two\nline three, improved\n');
  assert.equal(read('scripts/lib/c.mjs'), 'export const c = 3;\n');
  assert.ok(!existsSync(join(copy, 'scripts/old.mjs')));
  // Development records and the packs are never taken.
  assert.equal(read('docs/backlog.md'), '# Backlog v1\n');
  assert.ok(!existsSync(join(copy, 'docs/adr/0002-new.md')));
  assert.equal(read('apps/shop/app.json'), '{ "name": "our-shop" }\n');
  assert.deepEqual(readRecord(copy), { repository: upstream, release: 'v0.2.0' });
  assert.match(lines.at(-1), /Applied; the changes are staged\. Then run npm run gates\./);
  // The next update starts from the recorded release.
  commitAll(copy, 'framework v0.2.0');
  const again = frameworkUpdate(copy, { to: 'v0.2.0' });
  assert.equal(again.code, 1);
  assert.match(again.lines[0], /v0\.2\.0 is not later than v0\.2\.0/);
});

test('a change to the same lines is left as a conflict to resolve', () => {
  const { upstream, copy } = upstreamAndCopy();
  write(copy, { 'scripts/lib/a.mjs': 'export const a = 100;\n' });
  commitAll(copy, 'our a');
  const { code, lines } = frameworkUpdate(copy, {
    to: 'v0.2.0',
    from: 'v0.1.0',
    repository: upstream,
    write: true,
  });
  assert.equal(code, 1);
  assert.ok(lines.includes('  scripts/lib/a.mjs'), lines.join('\n'));
  assert.match(readFileSync(join(copy, 'scripts/lib/a.mjs'), 'utf8'), /^<<<<<<< /m);
});

test('an update is refused without a release to start from, on a dirty tree or for an unknown tag', () => {
  const { upstream, copy } = upstreamAndCopy();
  assert.equal(frameworkUpdate(copy, { to: '0.2.0', from: 'v0.1.0' }).code, 2);
  assert.match(frameworkUpdate(copy, { to: 'v0.2.0' }).lines[0], /no release to update from/);
  write(copy, { 'scripts/lib/a.mjs': 'dirty\n' });
  assert.match(
    frameworkUpdate(copy, { to: 'v0.2.0', from: 'v0.1.0', repository: upstream }).lines[0],
    /uncommitted changes/,
  );
  git(copy, 'checkout', '--', '.');
  assert.throws(
    () => frameworkUpdate(copy, { to: 'v0.3.0', from: 'v0.1.0', repository: upstream }),
    /cannot fetch v0\.1\.0 and v0\.3\.0/,
  );
});

test('a pack is read by the core when code or a test names its folder or quotes its name', () => {
  const root = repoWith(
    {
      'apps/shop/app.json': '{}\n',
      'apps/blog/app.json': '{}\n',
      'scripts/__tests__/x.test.mjs': "const pack = 'shop';\n",
      'scripts/lib/y.mjs': '// QA_BLOG_BASE_URL for the pack "blog"\nexport const y = 1;\n',
      'scripts/__fixtures__/z/apps/blog/a.md': "'blog'\n",
      'docs/guide.md': 'see apps/blog/README.md\n',
    },
    'readers-',
  );
  assert.deepEqual(coreReaders(root, 'shop'), ['scripts/__tests__/x.test.mjs']);
  // A comment, a fixture and the docs do not make the core depend on a pack.
  assert.deepEqual(coreReaders(root, 'blog'), []);
});

test('the pack leaves qa-config formatted as the repository formats it, and its table rows', async () => {
  const config = {
    app: {
      default_environment: 'local',
      environments: {
        local: { projects: ['desktop-chromium'], packs: { shop: {}, blog: {} } },
        ci: { packs: { blog: {} } },
      },
    },
  };
  const file = join(mkdtempSync(join(tmpdir(), 'config-')), 'qa-config.example.json');
  const result = await configWithout(JSON.stringify(config), 'blog', file);
  assert.deepEqual(JSON.parse(result.text).app.environments, {
    local: { projects: ['desktop-chromium'], packs: { shop: {} } },
    ci: { packs: {} },
  });
  // Prettier's layout: a short array stays on one line.
  assert.match(result.text, /"projects": \["desktop-chromium"\]/);
  assert.deepEqual(result.emptied, ['ci']);
  assert.equal(await configWithout(JSON.stringify(config), 'none', file), null);
  const markdown =
    '| Pack | Is |\n|---|---|\n| [shop](apps/shop/README.md) | a |\n| [blog](apps/blog/README.md) | b |\nThe blog in apps/blog/ prose stays.\n';
  assert.equal(
    markdownWithout(markdown, ['apps/blog/', '.claude/skills/blog-ui/']),
    '| Pack | Is |\n|---|---|\n| [shop](apps/shop/README.md) | a |\nThe blog in apps/blog/ prose stays.\n',
  );
  assert.equal(markdownWithout(markdown, ['apps/none/']), null);
});

test('removing a pack plans first, then removes it, edits its entries and lists the rest', async () => {
  const root = repoWith(
    {
      'apps/shop/app.json': '{}\n',
      'apps/blog/app.json': '{}\n',
      '.claude/skills/blog-ui/SKILL.md': '# Blog\n',
      'qa-config.example.json': `${JSON.stringify({ app: { environments: { local: { packs: { shop: {}, blog: {} } } } } }, null, 2)}\n`,
      'README.md':
        '| Pack |\n|---|\n| [shop](apps/shop/README.md) |\n| [blog](apps/blog/README.md) |\n',
      '.env.example': 'BLOG_PASSWORD=\n',
    },
    'remove-',
  );
  const plan = await removeApp(root, { name: 'blog' });
  assert.equal(plan.code, 0);
  assert.deepEqual(plan.lines, [
    'remove apps/blog/',
    'remove .claude/skills/blog-ui/',
    'edit   qa-config.example.json',
    'edit   README.md',
    'Still naming blog, to edit by hand:',
    '  .env.example',
    'Nothing changed; run again with --write to apply.',
  ]);
  assert.ok(existsSync(join(root, 'apps/blog')));
  const done = await removeApp(root, { name: 'blog', write: true });
  assert.equal(done.code, 0);
  assert.ok(!existsSync(join(root, 'apps/blog')));
  assert.ok(!existsSync(join(root, '.claude/skills/blog-ui')));
  assert.ok(existsSync(join(root, 'apps/shop/app.json')));
  assert.doesNotMatch(readFileSync(join(root, 'README.md'), 'utf8'), /blog/);
  assert.deepEqual(
    JSON.parse(readFileSync(join(root, 'qa-config.example.json'), 'utf8')).app.environments.local
      .packs,
    { shop: {} },
  );
  assert.equal((await removeApp(root, { name: 'blog' })).code, 1);
  assert.equal((await removeApp(root, { name: 'Blog!' })).code, 2);
});
