import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import { TAGS } from '../lib/tags.mjs';
import {
  laneEnvironment,
  laneGrep,
  LANES,
  listedTests,
  packsOf,
  planLane,
  recoveryPlan,
  runLane,
  summarizeFlakes,
  summarizeKnownGaps,
} from '../lanes.mjs';

const FIXTURES = join(REPO_ROOT, 'scripts', '__fixtures__', 'lanes');

test('every lane selects a tag of the taxonomy', () => {
  for (const [name, lane] of Object.entries(LANES)) assert.ok(TAGS.includes(lane.tag), name);
});

test('a lane forwards Playwright options and refuses what it must not take', () => {
  const mocked = planLane('mocked', ['--', '--project=juice-shop-*', 'specs/login']);
  assert.deepEqual(mocked.runArgs, [
    'test',
    '--grep',
    laneGrep('@mocked'),
    '--project=juice-shop-*',
    'specs/login',
  ]);
  assert.deepEqual(mocked.listArgs.slice(0, 2), ['test', '--list']);
  assert.equal(planLane('nope').usage, true);
  assert.equal(planLane(undefined).usage, true);
  assert.equal(planLane('toString').usage, true, 'not a property of every object');
  assert.match(planLane('mocked', ['--reporter=json']).refusal, /--reporter is refused.*QA_JSON/);
  assert.match(planLane('mocked', ['--reporter', 'line']).refusal, /--reporter is refused/);
  assert.match(planLane('known-gap', ['-u']).refusal, /--update-snapshots is refused/);
  assert.match(
    planLane('flake', ['--update-snapshots=all']).refusal,
    /--update-snapshots is refused/,
  );
  assert.match(planLane('destructive', ['-j', '4']).refusal, /sets --workers itself/);
  assert.match(planLane('mocked', ['--repeat', '3']).refusal, /does not take --repeat/);
  assert.match(planLane('mocked', ['--grep', '/TC-/i']).refusal, /plain pattern/);
});

test('the destructive lane runs on one worker with its lane variable', () => {
  const plan = planLane('destructive', ['--project=juice-shop-*']);
  assert.equal(plan.recovery, true);
  assert.ok(plan.runArgs.includes('--workers=1'));
  assert.deepEqual(plan.env, { QA_DESTRUCTIVE: '1' });
});

test('the flake lane repeats each case 10 times by default, without retries', () => {
  const plan = planLane('flake', []);
  assert.deepEqual(plan.env, { QA_INCLUDE_QUARANTINE: '1' });
  assert.ok(plan.runArgs.includes('--retries=0'));
  assert.ok(plan.runArgs.includes('--repeat-each=10'));
  assert.ok(!plan.listArgs.some((arg) => arg.startsWith('--repeat-each')));
  assert.ok(planLane('flake', ['--repeat', '3']).runArgs.includes('--repeat-each=3'));
  assert.ok(planLane('flake', ['--repeat=25']).runArgs.includes('--repeat-each=25'));
  assert.match(planLane('flake', ['--repeat', '0']).refusal, /at least 1/);
  assert.match(planLane('flake', ['--repeat-each=2']).refusal, /sets --repeat-each itself/);
  assert.match(planLane('flake', ['--retries', '2']).refusal, /sets --retries itself/);
});

test("a --grep narrows the lane's tag, never widens it", () => {
  const match = (pattern, title) => new RegExp(pattern, 'gi').test(title);
  assert.equal(match(laneGrep('@mocked'), 'TC-LOGIN-15 a server error @regression @mocked'), true);
  assert.equal(match(laneGrep('@mocked'), 'TC-LOGIN-16 @regression @mocked-later'), false);
  const narrowed = planLane('mocked', ['--grep', 'TC-LOGIN']).runArgs[2];
  assert.equal(match(narrowed, 'TC-LOGIN-15 a server error @regression @mocked'), true);
  assert.equal(match(narrowed, 'TC-SEARCH-15 a failed answer @regression @mocked'), false);
  assert.equal(match(narrowed, 'TC-LOGIN-01 signs in @smoke'), false);
});

test("a lane's run sets its own lane variables and clears every other lane's", () => {
  const env = laneEnvironment(planLane('mocked'), {
    PATH: 'x',
    QA_DESTRUCTIVE: '1',
    QA_INCLUDE_QUARANTINE: '1',
    QA_VISUAL: '1',
  });
  assert.deepEqual(env, { PATH: 'x' });
  assert.equal(laneEnvironment(planLane('flake'), {}).QA_INCLUDE_QUARANTINE, '1');
});

const LISTING = [
  'Listing tests:',
  '  [preflight-shop] › fixtures\\preflight.setup.ts:29:6 › the application answers',
  '  [shop-admin-desktop-chromium] › apps\\shop-admin\\specs\\wipe.spec.ts:5:1 › TC-WIPE-01 wipes @regression @destructive',
  '  [shop-mobile-chrome] › apps\\shop\\specs\\reset.spec.ts:5:1 › TC-RESET-01 resets @regression @destructive',
  'Total: 3 tests in 3 files',
].join('\r\n');

test('the listing gives the device projects; packs are matched by the longest name', () => {
  const listed = listedTests(LISTING);
  assert.deepEqual(
    listed.map((t) => t.project),
    ['shop-admin-desktop-chromium', 'shop-mobile-chrome'],
  );
  assert.ok(listed[1].title.endsWith('@destructive'), 'no carriage return left');
  assert.deepEqual(packsOf(new Set(listed.map((t) => t.project)), ['shop', 'shop-admin']), [
    'shop',
    'shop-admin',
  ]);
  assert.deepEqual(listedTests('Listing tests:\nTotal: 0 tests in 0 files\n'), []);
});

const ENVIRONMENT = {
  source: 'qa-config.example.json',
  name: 'local',
  packs: {
    shop: {
      base_url: 'http://localhost:3000/',
      recovery: { command: 'docker compose restart shop', ready_timeout_s: 30 },
    },
    readonly: { base_url: 'https://example.test' },
  },
};

test('every selected pack needs a recovery; its base URL follows the override', () => {
  assert.deepEqual(recoveryPlan(['shop'], ENVIRONMENT, { QA_SHOP_BASE_URL: 'http://ci:3000/' }), {
    recoveries: [
      {
        pack: 'shop',
        command: 'docker compose restart shop',
        baseUrl: 'http://ci:3000',
        timeoutS: 30,
      },
    ],
  });
  assert.match(
    recoveryPlan(['shop', 'readonly'], ENVIRONMENT, {}).refusal,
    /pack "readonly" has @destructive cases but .* no app\.environments\.local\.packs\.readonly\.recovery/,
  );
  assert.match(recoveryPlan(['other'], ENVIRONMENT, {}).refusal, /no .*packs\.other: pack "other"/);
});

test('the known-gap summary groups the cases: armed, now passing, failing otherwise', () => {
  const report = JSON.parse(readFileSync(join(FIXTURES, 'known-gap-report.json'), 'utf8'));
  const summary = summarizeKnownGaps(report);
  assert.deepEqual(summary.groups, {
    armed: [
      'TC-CART-03 (shop-desktop-chromium, shop-mobile-chrome)',
      'TC-CART-07 (shop-mobile-chrome)',
    ],
    passing: ['TC-CART-07 (shop-desktop-chromium)'],
    other: ['TC-CART-09 (shop-desktop-chromium)'],
    skipped: ['TC-CART-10 (shop-desktop-chromium)'],
  });
  assert.equal(summary.ok, false);
  assert.match(summary.lines[1], /now passing .*: TC-CART-07/);
  const armedOnly = {
    suites: [{ title: 'a', specs: report.suites[1].specs.slice(0, 1) }],
  };
  assert.equal(summarizeKnownGaps(armedOnly).ok, true);
  const teardown = summarizeKnownGaps({ ...armedOnly, errors: [{ message: 'dispose: ENOENT' }] });
  assert.equal(teardown.ok, false, 'an error outside any test fails the lane');
  assert.match(teardown.lines.at(-1), /errors outside any test: 1/);
});

test('the known-gap summary lists the armed cases the page health guard noted', () => {
  const entry = (annotations) => ({
    projectName: 'shop-desktop-chromium',
    status: 'expected',
    expectedStatus: 'failed',
    results: [{ status: 'failed', annotations }],
  });
  const report = {
    suites: [
      {
        title: 'a',
        specs: [
          { title: 'TC-CART-03 x', tags: ['known-gap'], tests: [entry([{ type: 'page-health' }])] },
          { title: 'TC-CART-04 x', tags: ['known-gap'], tests: [entry([{ type: 'issue' }])] },
        ],
      },
    ],
  };
  const summary = summarizeKnownGaps(report);
  assert.deepEqual(summary.health, ['TC-CART-03 (shop-desktop-chromium)']);
  assert.ok(
    summary.lines.includes('page health problems noted: TC-CART-03 (shop-desktop-chromium)'),
  );
  assert.equal(summary.ok, true, 'a note does not fail the lane');
});

const spec = (title, tags, outcomes, project = 'shop-desktop-chromium') => ({
  title,
  tags,
  tests: outcomes.map((status) => ({ projectName: project, status, results: [{}] })),
});

test('the flake summary counts the failed repetitions per case and project', () => {
  const report = {
    suites: [
      {
        title: 'cart.spec.ts',
        specs: [
          spec(
            'TC-CART-04 adds @regression @quarantine',
            ['regression', 'quarantine'],
            ['expected', 'unexpected', 'expected'],
          ),
          spec(
            'TC-CART-04 adds @regression @quarantine',
            ['regression', 'quarantine'],
            ['unexpected', 'unexpected', 'expected'],
            'shop-mobile-chrome',
          ),
          spec(
            'TC-CART-05 removes @regression @quarantine',
            ['regression', 'quarantine'],
            ['expected', 'expected'],
          ),
        ],
      },
    ],
  };
  const summary = summarizeFlakes(report);
  assert.deepEqual(summary.lines, [
    'TC-CART-04: 3 of 6 repetitions failed (shop-desktop-chromium 1/3, shop-mobile-chrome 2/3)',
    'TC-CART-05: 0 of 2 repetitions failed (shop-desktop-chromium 0/2)',
  ]);
  assert.equal(summary.ok, false);
  assert.equal(
    summarizeFlakes({ suites: [{ title: 'x', specs: [report.suites[0].specs[2]] }] }).ok,
    true,
  );
});

/** A machine where Playwright lists `listing`, runs with `runStatus`, and every call is recorded. */
function fakeIo({ listing = LISTING, runStatus = 0, recoveryStatus = 0, report = null } = {}) {
  const calls = [];
  const lines = [];
  return {
    calls,
    lines,
    root: REPO_ROOT,
    env: {},
    out: { log: (line) => lines.push(line), error: (line) => lines.push(line) },
    playwright: (args, env) => {
      calls.push(['playwright', args.includes('--list') ? 'list' : 'run', env]);
      return args.includes('--list')
        ? { status: 0, stdout: listing, stderr: '' }
        : { status: runStatus };
    },
    shell: (command) => {
      calls.push(['shell', command]);
      return { status: recoveryStatus };
    },
    answers: async (url) => {
      calls.push(['answers', url]);
      return true;
    },
    readJson: () => report,
    remove: () => {},
    environment: () => ({
      ...ENVIRONMENT,
      packs: { ...ENVIRONMENT.packs, 'shop-admin': ENVIRONMENT.packs.shop },
    }),
    packs: () => ['shop', 'shop-admin'],
  };
}

test('the destructive lane recovers every selected pack even when the run failed', async () => {
  const io = fakeIo({ runStatus: 1 });
  assert.equal(await runLane(planLane('destructive'), io), 1);
  assert.deepEqual(
    io.calls.map(([kind, what]) => `${kind} ${what}`),
    [
      'playwright list',
      'playwright run',
      'shell docker compose restart shop',
      'answers http://localhost:3000',
      'shell docker compose restart shop',
      'answers http://localhost:3000',
    ],
  );
  assert.equal(io.calls[1][2].QA_DESTRUCTIVE, '1');
});

test('a failed recovery fails a lane whose run passed', async () => {
  const io = fakeIo({ recoveryStatus: 3 });
  assert.equal(await runLane(planLane('destructive'), io), 1);
  assert.ok(io.lines.some((line) => /recovery of shop failed \(exit 3\)/.test(line)));
});

test('a pack without recovery is refused before anything runs', async () => {
  const io = fakeIo();
  io.environment = () => ENVIRONMENT;
  assert.equal(await runLane(planLane('destructive'), io), 2);
  assert.deepEqual(
    io.calls.map(([kind, what]) => `${kind} ${what}`),
    ['playwright list'],
  );
});

test('a lane with no case says so and runs nothing', async () => {
  const io = fakeIo({ listing: 'Listing tests:\nTotal: 0 tests in 0 files\n' });
  assert.equal(await runLane(planLane('destructive'), io), 0);
  assert.equal(io.calls.length, 1);
  assert.ok(io.lines.some((line) => /no @destructive case in this selection/.test(line)));
});

test('the known-gap lane fails when a gap passes, though Playwright alone would not say why', async () => {
  const report = JSON.parse(readFileSync(join(FIXTURES, 'known-gap-report.json'), 'utf8'));
  const io = fakeIo({ report });
  assert.equal(await runLane(planLane('known-gap'), io), 1);
  assert.match(io.calls[1][2].QA_JSON_REPORT, /reports[\\/]lanes[\\/]known-gap\.json$/);
  assert.ok(io.lines.some((line) => /now passing .*TC-CART-07/.test(line)));
  const missing = fakeIo({ report: null });
  assert.equal(await runLane(planLane('known-gap'), missing), 1);
  assert.ok(missing.lines.some((line) => /no JSON report/.test(line)));
});
