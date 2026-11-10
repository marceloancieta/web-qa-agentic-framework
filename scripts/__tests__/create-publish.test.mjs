// Publishing create-web-qa (FUT-12): .github/workflows/publish.yml publishes the folder that
// `npm run create:pack -- --tag` builds, with the OIDC token of that workflow alone, and reads the
// version back. A published version can never be replaced, so each check before the publish is
// pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { parse } from 'yaml';
import { publishProblems } from '../../packages/create-web-qa/prepublish.mjs';
import { PACKAGE_DIR, releaseProblems } from '../create-package.mjs';
import { byHand, DEFAULT_MINUTES, readBack } from '../create-readback.mjs';
import { REPO_ROOT } from '../lib/cli.mjs';
import { FRAMEWORK_REPOSITORY } from '../lib/product.mjs';

const WORKFLOWS = join(REPO_ROOT, '.github', 'workflows');
const readJson = (path) => JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8'));

test('publishing refuses a folder without its template, built without the tag, or at another version', () => {
  const dir = mkdtempSync(join(tmpdir(), 'create-publish-'));
  const write = (file, value) => {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), JSON.stringify(value));
  };
  write('package.json', { version: '1.2.3' });
  const fix = 'run npm run create:pack -- --tag v1.2.3 on a checkout of that tag';
  assert.deepEqual(publishProblems(dir), [`it has no release.json or no template: ${fix}`]);
  write('template/package.json', { version: '1.2.3' });
  assert.deepEqual(publishProblems(dir), [`it has no release.json or no template: ${fix}`]);
  write('release.json', { tag: null });
  assert.deepEqual(publishProblems(dir), [`it was built without --tag: ${fix}`]);
  write('release.json', { tag: 'v1.2.2' });
  write('template/package.json', { version: '1.2.2' });
  assert.deepEqual(publishProblems(dir), [
    `it was built for v1.2.2: ${fix}`,
    'its template is 1.2.2, the package is 1.2.3',
  ]);
  write('release.json', { tag: 'v1.2.3' });
  write('template/package.json', { version: '1.2.3' });
  assert.deepEqual(publishProblems(dir), []);
  // The source folder is never ready: it has no template.
  assert.equal(publishProblems(join(REPO_ROOT, PACKAGE_DIR)).length, 1);
  assert.equal(
    readJson(`${PACKAGE_DIR}/package.json`).scripts.prepublishOnly,
    'node prepublish.mjs',
  );
});

/** A git that answers from a table of `args.join(' ')` → `{ status, stdout }`. */
function fakeGit(answers) {
  return (args) => answers[args.join(' ')] ?? { status: 1, stdout: '' };
}

const RELEASED = {
  'rev-parse --verify --quiet v1.2.3^{commit}': { status: 0, stdout: 'abc\n' },
  'rev-parse HEAD': { status: 0, stdout: 'abc\n' },
  'status --porcelain': { status: 0, stdout: '' },
  'merge-base --is-ancestor abc origin/main': { status: 0, stdout: '' },
};

test('a release build needs the tag of the package version, checked out clean, on main', () => {
  const check = (tag, answers = RELEASED, version = '1.2.3') =>
    releaseProblems(tag, { version, git: fakeGit(answers) });
  assert.deepEqual(check('v1.2.3'), []);
  assert.deepEqual(check('1.2.3'), ['"1.2.3" is not a release tag vX.Y.Z']);
  assert.deepEqual(check(undefined), ['"" is not a release tag vX.Y.Z']);
  assert.deepEqual(check('v1.2.3-rc.1'), ['"v1.2.3-rc.1" is not a release tag vX.Y.Z']);
  assert.deepEqual(check('v1.2.3', RELEASED, '1.2.4'), [
    'the package is 1.2.4, not 1.2.3; a release tags its release commit',
  ]);
  assert.deepEqual(check('v1.2.3', {}), ['the tag v1.2.3 does not exist']);
  assert.deepEqual(
    check('v1.2.3', {
      ...RELEASED,
      'rev-parse HEAD': { status: 0, stdout: 'def\n' },
      'status --porcelain': { status: 0, stdout: ' M README.md\n' },
      'merge-base --is-ancestor abc origin/main': { status: 1, stdout: '' },
    }),
    [
      'the checkout is not v1.2.3; check the tag out',
      'the working tree has changes, and the build reads it',
      'v1.2.3 is not on origin/main; a release is a tag on main',
    ],
  );
});

test('the package is published from a release tag of its own repository, with no stored token', () => {
  const text = readFileSync(join(WORKFLOWS, 'publish.yml'), 'utf8');
  const workflow = parse(text);
  assert.deepEqual(workflow.on, { push: { tags: ['v[0-9]+.[0-9]+.[0-9]+'] } });
  assert.deepEqual(workflow.permissions, {});
  assert.deepEqual(Object.keys(workflow.jobs), ['create-web-qa', 'github-release']);
  const job = workflow.jobs['create-web-qa'];
  const slug = new URL(FRAMEWORK_REPOSITORY).pathname.slice(1);
  assert.equal(readJson(`${PACKAGE_DIR}/package.json`).repository.url, FRAMEWORK_REPOSITORY);
  assert.equal(job.if, `\${{ github.repository == '${slug}' }}`);
  assert.equal(job.environment, 'npm');
  assert.deepEqual(job.permissions, { contents: 'read', 'id-token': 'write' });
  assert.deepEqual(job.env, { TAG: '${{ github.ref_name }}' });
  assert.doesNotMatch(text, /secrets\.|NODE_AUTH_TOKEN|NPM_TOKEN/);
  assert.ok(job['timeout-minutes'] >= DEFAULT_MINUTES + 10, 'the job outlasts the read-back');

  // Only the pinned npm is installed, then the build from the tag, the publish and the read-back,
  // in that order.
  assert.deepEqual(
    job.steps.filter((step) => step.run).map((step) => step.run.trim()),
    [
      'npm install --global npm@11.21.0',
      'npm run create:pack -- --tag "$TAG"',
      'npm run create:publish',
      'npm run create:readback -- --tag "$TAG"',
    ],
  );
  const checkout = job.steps.find((step) => step.uses?.startsWith('actions/checkout@'));
  assert.deepEqual(checkout.with, { 'fetch-depth': 0, 'persist-credentials': false });
  assert.equal(
    readJson('package.json').scripts['create:publish'],
    'npm stage publish reports/create-web-qa/package --access public --provenance',
  );

  // The GitHub release follows the publish, and can neither publish nor wait in its environment.
  const release = workflow.jobs['github-release'];
  assert.equal(release.needs, 'create-web-qa');
  assert.deepEqual(release.permissions, { contents: 'write' });
  assert.equal(release.environment, undefined);
  assert.deepEqual(
    release.steps.filter((step) => step.run).map((step) => step.run.trim()),
    ['npm run release:create -- --tag "$TAG"'],
  );

  // No other workflow can mint the token npm trusts.
  for (const file of readdirSync(WORKFLOWS).filter((name) => name !== 'publish.yml'))
    assert.doesNotMatch(readFileSync(join(WORKFLOWS, file), 'utf8'), /id-token/, file);
});

/** The modules `file` imports, followed through relative imports; bare and `node:` ones listed. */
function importsOf(file, seen = new Set()) {
  if (seen.has(file)) return [];
  seen.add(file);
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/^import\s[^;]*?from\s+'([^']+)';/gms)].flatMap(([, spec]) =>
    spec.startsWith('.') ? importsOf(join(dirname(file), spec), seen) : [spec],
  );
}

test('the publish job runs no dependency: its scripts import only Node', () => {
  for (const script of [
    'scripts/create-package.mjs',
    'scripts/create-readback.mjs',
    `${PACKAGE_DIR}/prepublish.mjs`,
  ]) {
    const outside = importsOf(join(REPO_ROOT, script)).filter((spec) => !spec.startsWith('node:'));
    assert.deepEqual(outside, [], relative(REPO_ROOT, script));
  }
});

/** A registry that shows the version after `delays` polls, and a project that records `release`. */
function fakeRegistry({ delays = 0, release = 'v1.2.3' } = {}) {
  let clock = 0;
  let polls = 0;
  const calls = [];
  return {
    calls,
    io: {
      view: (version) => (polls++ >= delays ? version : null),
      create: (version) => {
        calls.push(`create ${version}`);
        return release;
      },
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    },
  };
}

test('the read-back waits for the registry, then checks the project npm create makes', async () => {
  const late = fakeRegistry({ delays: 4 });
  const done = await readBack({ version: '1.2.3', minutes: 15, io: late.io });
  assert.equal(done.code, 0, done.lines.join('\n'));
  assert.deepEqual(late.calls, ['create 1.2.3']);

  const never = fakeRegistry({ delays: Infinity });
  const timedOut = await readBack({ version: '1.2.3', minutes: 15, io: never.io });
  assert.equal(timedOut.code, 1);
  assert.match(timedOut.lines[0], /did not show create-web-qa@1\.2\.3 within 15 minutes/);
  assert.deepEqual(never.calls, [], 'no project is made from a version the registry does not show');

  const wrong = await readBack({ version: '1.2.3', io: fakeRegistry({ release: null }).io });
  assert.equal(wrong.code, 1);
  assert.match(wrong.lines[0], /did not make a project of v1\.2\.3 \(it recorded nothing\)/);

  // Every failure follows a good stage, so it says not to re-run, how to approve the staged version
  // and how to read it back by hand.
  for (const { lines } of [timedOut, wrong]) assert.ok(lines[0].endsWith(byHand('1.2.3')));
  assert.match(byHand('1.2.3'), /do not re-run/);
  assert.match(byHand('1.2.3'), /npm stage list create-web-qa and npm stage approve <stage-id>/);
  assert.match(byHand('1.2.3'), /two-factor authentication/);
  assert.match(byHand('1.2.3'), /npm create web-qa@1\.2\.3 readback/);
  assert.match(byHand('1.2.3'), /outside the repository/);
});
