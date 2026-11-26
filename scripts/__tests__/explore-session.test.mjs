import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  composeArgs,
  composeServices,
  exploreServiceOf,
  guardDecision,
  planSession,
  repoChanges,
  repoSnapshot,
} from '../lib/explore-session.mjs';
import { gitEnv } from '../lib/git.mjs';

const CHARTER = {
  mission: 'Find where the cart badge and the cart disagree',
  pack: 'shop',
  environment: 'local',
  routes: ['/inventory'],
  role: 'customer',
  device: 'desktop-chromium',
  driver: 'agent',
  writes: 'none',
  out_of_bounds: [],
  minutes: 30,
};
const ENVIRONMENT = {
  source: 'qa-config.example.json',
  name: 'local',
  packs: {
    shop: {
      base_url: 'http://localhost:4000/',
      allow_writes: true,
      actors: { customer: { account: 'provisioned' } },
    },
  },
};
const PROJECTS = [
  { name: 'desktop-chromium', browser: 'chromium' },
  { name: 'desktop-webkit', browser: 'webkit' },
];
const APP = { cookies: { banner: 'dismissed' }, app_map: { session_writes: ['POST /api/renew'] } };
const SERVICES = {
  shop: { image: 'shop' },
  'shop-explore': { profiles: ['explore'], image: 'shop', ports: ['127.0.0.1:4010:3000'] },
};
const plan = (
  charter = {},
  { environment = ENVIRONMENT, app = APP, env = {}, services = SERVICES } = {},
) =>
  planSession({
    charter: { ...CHARTER, ...charter },
    environment,
    app,
    projects: PROJECTS,
    services,
    env,
  });

test('a charter that fits the configuration gets a plan', () => {
  const { plan: got, refusal } = plan();
  assert.equal(refusal, undefined);
  assert.deepEqual(got, {
    pack: 'shop',
    environment: 'local',
    baseUrl: 'http://localhost:4000',
    origin: 'http://localhost:4000',
    copy: null,
    routes: ['/inventory'],
    role: 'customer',
    device: 'desktop-chromium',
    driver: 'agent',
    writes: 'none',
    minutes: 30,
    sessionWrites: ['POST /api/renew'],
    cookies: { banner: 'dismissed' },
  });
  assert.equal(plan({ role: 'anonymous' }).plan.role, 'anonymous');
});

test('a session never runs where qa-config does not name the target', () => {
  const production = { ...ENVIRONMENT, name: 'prod-eu' };
  assert.match(
    plan({ environment: 'prod-eu' }, { environment: production }).refusal,
    /looks like production/,
  );
  assert.match(plan({ environment: 'staging' }).refusal, /set QA_ENV=staging/);
  assert.match(plan({ pack: 'other' }).refusal, /no app.environments.local.packs.other/);
  const moved = { env: { QA_SHOP_BASE_URL: 'http://shop.example.com' } };
  assert.match(plan({}, moved).refusal, /QA_SHOP_BASE_URL points at http:\/\/shop.example.com/);
  const samePlace = { env: { QA_SHOP_BASE_URL: 'http://localhost:4000/app' } };
  assert.equal(plan({}, samePlace).plan.baseUrl, 'http://localhost:4000/app');
});

test('a writing session needs writes allowed, a disposable copy and no account', () => {
  const writing = { writes: 'allowed', role: 'anonymous' };
  const readOnly = {
    ...ENVIRONMENT,
    packs: { shop: { ...ENVIRONMENT.packs.shop, allow_writes: false } },
  };
  assert.match(plan(writing, { environment: readOnly }).refusal, /does not allow writes/);
  assert.match(
    plan(writing, { services: { shop: {} } }).refusal,
    /docker\/compose.yml has no service shop-explore in the explore profile/,
  );
  assert.match(plan({ writes: 'allowed' }).refusal, /its role is anonymous/);
  const { plan: got } = plan(writing);
  assert.equal(got.baseUrl, 'http://localhost:4010');
  assert.equal(got.origin, 'http://localhost:4010');
  assert.deepEqual(got.copy, {
    service: 'shop-explore',
    port: 4010,
    project: 'web-qa-explore-shop',
  });
});

test('only a service of the explore profile with a port on 127.0.0.1 is a copy', () => {
  const cases = [
    [
      { ports: ['127.0.0.1:4010:3000'], profiles: ['explore'] },
      { service: 'shop-explore', port: 4010 },
    ],
    [{ ports: ['127.0.0.1:4010:3000'] }, null],
    [{ ports: ['0.0.0.0:4010:3000'], profiles: ['explore'] }, null],
    [{ ports: ['4010:3000'], profiles: ['explore'] }, null],
    [{ expose: ['3000'], profiles: ['explore'] }, null],
  ];
  for (const [entry, expected] of cases)
    assert.deepEqual(exploreServiceOf({ 'shop-explore': entry }, 'shop'), expected);
  assert.equal(exploreServiceOf({}, 'shop'), null);
});

test('the copy starts fresh and is removed in a compose project of its own', () => {
  const copy = { service: 'shop-explore', port: 4010, project: 'web-qa-explore-shop' };
  const head = ['compose', '-p', 'web-qa-explore-shop', '-f', join('docker', 'compose.yml')];
  assert.deepEqual(composeArgs(copy, 'up'), [
    ...head,
    '--profile',
    'explore',
    'up',
    '-d',
    '--wait',
    '--force-recreate',
    '--renew-anon-volumes',
    'shop-explore',
  ]);
  assert.deepEqual(composeArgs(copy, 'down'), [
    ...head,
    '--profile',
    'explore',
    'down',
    '--volumes',
    '--remove-orphans',
  ]);
});

test('the repository compose file gives Juice Shop a copy on a port of its own', () => {
  const services = composeServices(join(import.meta.dirname, '..', '..'));
  const copy = exploreServiceOf(services, 'juice-shop');
  assert.ok(copy, 'docker/compose.yml has juice-shop-explore');
  assert.equal(services['juice-shop-explore'].image, services['juice-shop'].image);
  assert.notEqual(copy.port, 3000);
  assert.equal(exploreServiceOf(services, 'spree'), null);
});

test('the role, the device and the time box are checked', () => {
  assert.match(
    plan({ role: 'admin' }).refusal,
    /no actor "admin" in "local"; the roles are customer/,
  );
  assert.match(plan({ device: 'tv' }).refusal, /no device project "tv"/);
  assert.match(plan({ device: 'desktop-webkit' }).refusal, /runs on webkit; .* over CDP/);
  assert.match(plan({ minutes: 61 }).refusal, /60 at most/);
  assert.equal(plan({ driver: 'person', minutes: 90 }).plan.minutes, 90);
});

const GUARD = {
  origin: 'http://localhost:4000',
  writes: 'none',
  sessionWrites: ['POST /api/renew'],
};

test('the guard lets reads of the origin through and stops everything else', () => {
  const at = (method, url, settings = GUARD) => guardDecision({ method, url }, settings);
  assert.deepEqual(at('GET', 'http://localhost:4000/inventory?q=1'), { allow: true });
  assert.deepEqual(at('options', 'http://localhost:4000/api'), { allow: true });
  assert.deepEqual(at('GET', 'https://fonts.example.com/a.css'), {
    allow: false,
    reason: 'origin',
  });
  assert.deepEqual(at('GET', 'http://localhost:4001/'), { allow: false, reason: 'origin' });
  assert.deepEqual(at('POST', 'http://localhost:4000/api/orders/42'), {
    allow: false,
    reason: 'write',
    write: 'POST /api/orders/:id',
  });
  assert.deepEqual(at('post', 'http://localhost:4000/api/renew'), { allow: true });
  assert.deepEqual(at('PUT', 'http://localhost:4000/api/renew').allow, false);
  assert.deepEqual(at('GET', 'data:image/png;base64,AAAA'), { allow: true });
  const writing = { ...GUARD, writes: 'allowed' };
  assert.deepEqual(at('DELETE', 'http://localhost:4000/api/orders/1', writing), { allow: true });
  assert.deepEqual(at('POST', 'https://other.example.com/', writing).reason, 'origin');
});

test('repoChanges reports what changed outside the sheet since the snapshot', () => {
  const before = { head: 'a'.repeat(40), files: { 'sheet.md': '1', 'wip.ts': '2' } };
  assert.deepEqual(repoChanges(before, before, ['sheet.md']), []);
  const after = {
    head: 'b'.repeat(40),
    files: { 'sheet.md': '9', 'wip.ts': '3', 'new.md': '4' },
  };
  assert.deepEqual(repoChanges(before, after, ['sheet.md']), [
    'HEAD moved from aaaaaaa to bbbbbbb',
    'new.md changed',
    'wip.ts changed again',
  ]);
  const restored = { head: before.head, files: { 'sheet.md': '1' } };
  assert.deepEqual(repoChanges(before, restored, ['sheet.md']), ['wip.ts was restored']);
});

test('repoSnapshot reads HEAD and the changed and untracked files of a real repository', () => {
  const root = mkdtempSync(join(tmpdir(), 'explore-repo-'));
  const git = (...args) =>
    spawnSync('git', args, { cwd: root, env: gitEnv(), encoding: 'utf8' }).stdout;
  try {
    git('init', '-q');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'test');
    writeFileSync(join(root, 'kept.md'), 'one\n');
    writeFileSync(join(root, '.gitignore'), 'reports/\n');
    git('add', '.');
    git('commit', '-qm', 'first');
    const clean = repoSnapshot(root);
    assert.match(clean.head, /^[0-9a-f]{40}$/);
    assert.deepEqual(clean.files, {});
    writeFileSync(join(root, 'kept.md'), 'two\n');
    writeFileSync(join(root, 'new file.md'), 'x\n');
    writeFileSync(join(root, '.gitignore'), 'reports/\n');
    const dirty = repoSnapshot(root);
    assert.deepEqual(Object.keys(dirty.files).sort(), ['kept.md', 'new file.md']);
    assert.deepEqual(repoChanges(clean, dirty, ['kept.md']), ['new file.md changed']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
