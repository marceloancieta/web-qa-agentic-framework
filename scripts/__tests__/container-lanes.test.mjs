import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergePlan } from '../ci-merge.mjs';
import { REPO_ROOT } from '../lib/cli.mjs';
import { containerUrl, imageProblem, pinnedImage, returnOwnership } from '../lib/container.mjs';
import { evaluate, newestPackResultStart, reportTests, staleReasons } from '../quality-gate.mjs';
import { laneEnvironment, planLane } from '../visual-lane.mjs';

const DIGEST = 'a'.repeat(64);

test('the pinned image is read from compose and must match @playwright/test', () => {
  assert.deepEqual(
    pinnedImage(`  image: mcr.microsoft.com/playwright:v1.2.3-noble@sha256:${DIGEST}\n`),
    {
      ref: `mcr.microsoft.com/playwright:v1.2.3-noble@sha256:${DIGEST}`,
      version: '1.2.3',
    },
  );
  assert.equal(
    pinnedImage('image: mcr.microsoft.com/playwright:v1.2.3-noble'),
    null,
    'a tag without a digest',
  );
  assert.equal(
    imageProblem(REPO_ROOT),
    null,
    'the repository pins the image of its own Playwright version',
  );
});

test('host addresses become host.docker.internal; other hosts stay', () => {
  assert.equal(containerUrl('http://localhost:3000'), 'http://host.docker.internal:3000');
  assert.equal(containerUrl('http://127.0.0.1:3000/app'), 'http://host.docker.internal:3000/app');
  assert.equal(containerUrl('https://www.saucedemo.com'), 'https://www.saucedemo.com');
  const env = laneEnvironment(REPO_ROOT, { QA_ENV: 'local' });
  assert.equal(env.QA_VISUAL, '1');
  assert.equal(env.QA_JUICE_SHOP_BASE_URL, 'http://host.docker.internal:3000');
  assert.equal(env.QA_JSON_REPORT, 'reports/lanes/visual.json');
});

test("what the lane wrote as root goes back to the repository's owner, and only that", () => {
  const root = mkdtempSync(join(tmpdir(), 'owner-'));
  for (const dir of [
    'reports/lanes',
    'test-results/case',
    'node_modules/x',
    '.git/objects',
    'src',
  ]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  for (const file of ['reports/lanes/visual.json', 'test-results/case/diff.png', 'src/kept.ts']) {
    writeFileSync(join(root, file), '');
  }
  // As a Linux host shows the mount: the repository is the user's, the lane's output root's.
  const byRoot = ['reports', 'test-results', 'node_modules', '.git'];
  const lstat = (path) => {
    const relative = path.slice(root.length + 1).replaceAll('\\', '/');
    return { uid: byRoot.some((dir) => relative.startsWith(dir)) ? 0 : 1000, gid: 1000 };
  };
  const calls = [];
  const chown = (path, uid, gid) => calls.push([path.slice(root.length + 1), uid, gid]);
  const changed = returnOwnership(root, { uid: 0, lstat, chown });
  assert.deepEqual(calls.map(([path]) => path.replaceAll('\\', '/')).sort(), [
    'reports',
    'reports/lanes',
    'reports/lanes/visual.json',
    'test-results',
    'test-results/case',
    'test-results/case/diff.png',
  ]);
  assert.ok(calls.every(([, uid, gid]) => uid === 1000 && gid === 1000));
  assert.equal(changed.length, calls.length);
  // Not root: nothing to give back. A repository root owns (Docker Desktop's view): nothing either.
  assert.deepEqual(returnOwnership(root, { uid: 1000, lstat, chown: assert.fail }), []);
  const allRoot = () => ({ uid: 0, gid: 0 });
  assert.deepEqual(returnOwnership(root, { uid: 0, lstat: allRoot, chown: assert.fail }), []);
});

test('the lane: updates only in the automate phase, Playwright options passed through', () => {
  assert.deepEqual(planLane(['--project=juice-shop-*']), {
    phase: 'run',
    update: false,
    forwarded: ['--project=juice-shop-*'],
  });
  assert.deepEqual(planLane(['--phase', 'automate', '--update']), {
    phase: 'automate',
    update: true,
    forwarded: [],
  });
  assert.match(planLane(['--update']).refusal, /automate phase only/);
  assert.match(planLane(['-u']).refusal, /instead of Playwright's --update-snapshots/);
  assert.match(
    planLane(['--phase', 'automate', '--update-snapshots=all']).refusal,
    /--update-snapshots/,
  );
  assert.match(planLane(['--phase', 'publish']).refusal, /run or automate/);
});

test('the lane refuses to run outside the pinned image', () => {
  const env = { ...process.env };
  delete env.QA_IN_PLAYWRIGHT_IMAGE;
  const run = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts', 'visual-lane.mjs')], {
    encoding: 'utf8',
    env,
  });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /not the pinned Playwright image/);
});

const attach = (comparison) => ({
  name: 'axe /#/login',
  contentType: 'application/json',
  body: Buffer.from(JSON.stringify({ comparison })).toString('base64'),
});
const spec = (title, tags, status, attachments = []) => ({
  title,
  tags,
  tests: [{ projectName: 'shop-desktop-chromium', status, results: [{ attachments }] }],
});
const report = {
  suites: [
    {
      title: 'login.spec.ts',
      specs: [
        spec('signs in', ['smoke'], 'expected', [
          attach({ new: [{ impact: 'serious' }, { impact: 'minor' }] }),
        ]),
        spec('wrong password', ['regression'], 'flaky'),
        spec('known gap', ['regression'], 'skipped'),
        spec('login looks right', ['regression', 'visual'], 'unexpected'),
      ],
    },
  ],
};

test('the report is read with tags normalized and the last result of each test', () => {
  const tests = reportTests(report);
  assert.equal(tests.length, 4);
  assert.deepEqual(tests[3].tags, ['@regression', '@visual']);
});

test('the gate bands each check and the worst verdict wins', () => {
  const gate = {
    pass_rate: { fail_below_pct: 50, review_below_pct: 100 },
    accessibility: { fail_above: { critical: 0 }, review_above: { serious: 0 } },
    visual: { fail_above: 1 },
  };
  const { checks, overall } = evaluate(report, gate);
  const byName = Object.fromEntries(checks.map((c) => [c.name, c]));
  assert.equal(byName.pass_rate.verdict, 'REVIEW');
  assert.match(byName.pass_rate.detail, /66\.7% \(2\/3\); flaky: login\.spec\.ts > wrong password/);
  assert.equal(byName.accessibility.verdict, 'REVIEW');
  assert.match(byName.accessibility.detail, /serious 1, moderate 0, minor 1/);
  assert.equal(byName.visual.verdict, 'PASS');
  assert.equal(overall, 'REVIEW');
  assert.equal(evaluate(report, { ...gate, visual: { fail_above: 0 } }).overall, 'FAIL');
  assert.equal(
    evaluate({ suites: [] }, gate).checks.every((c) => c.verdict === 'SKIPPED'),
    true,
  );
});

const ranAt = (runId, startTime, duration) => ({
  config: { metadata: runId ? { runId } : {} },
  stats: { startTime, duration },
});

test('the gate refuses reports that are not of the latest run, and takes those that are', () => {
  const matrix = ranAt('ci-7', '2026-10-30T10:00:00.000Z', 60_000);
  const sweep = ranAt('ci-7', '2026-10-30T10:00:30.000Z', 60_000);
  const inside = Date.parse('2026-10-30T10:01:00.000Z');
  assert.deepEqual(
    staleReasons([matrix, sweep], { expectedRunId: 'ci-7', newestResultStart: inside }),
    [],
  );
  // A report written before the run whose results are in allure-results would give a false FAIL.
  const old = ranAt(null, '2026-10-24T23:00:00.000Z', 60_000);
  assert.match(
    staleReasons([old], { newestResultStart: inside })[0],
    /a run started at 2026-10-30T10:01:00\.000Z, after the report's run ended at 2026-10-24T23:01:00\.000Z/,
  );
  assert.match(
    staleReasons([matrix, ranAt('local-1', '2026-10-30T10:00:00.000Z', 1)])[0],
    /different runs: ci-7, local-1/,
  );
  assert.match(
    staleReasons([matrix], { expectedRunId: 'ci-8' })[0],
    /QA_RUN_ID is ci-8, the report is of run ci-7/,
  );
  // Without results or a run id to compare, nothing is refused.
  assert.deepEqual(staleReasons([old]), []);
});

test("the newest result start counts only the packs' specs", () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-results-'));
  const write = (name, fullName, start) =>
    writeFileSync(join(dir, `${name}-result.json`), JSON.stringify({ fullName, start }));
  write('a', 'apps/juice-shop/specs/login/login.spec.ts#TC-LOGIN-01', 100);
  write('b', 'apps\\juice-shop\\specs\\search\\search.spec.ts#TC-SEARCH-02', 200);
  write('c', 'helpers/__tests__/visual.spec.ts#fits the viewport', 900);
  assert.equal(newestPackResultStart(dir), 200);
  assert.equal(newestPackResultStart(join(dir, 'missing')), null);
});

test('the merge joins the blobs into the HTML report and the JSON report the gate reads', () => {
  const plan = mergePlan({ blobs: 'all-blobs', json: 'reports/playwright.json', env: { CI: '1' } });
  assert.deepEqual(plan.args, ['merge-reports', '--reporter', 'html,json', 'all-blobs']);
  assert.equal(plan.env.PLAYWRIGHT_JSON_OUTPUT_FILE, 'reports/playwright.json');
  assert.equal(plan.env.PLAYWRIGHT_HTML_OPEN, 'never');
  assert.equal(plan.env.CI, '1');
});
