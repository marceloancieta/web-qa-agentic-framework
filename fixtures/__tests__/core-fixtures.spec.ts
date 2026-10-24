// The core fixtures with a provider for the fake application: actors start signed in without the
// login screen, the browser state is kept per worker, the API client shares the session, and the
// page health guard and the accessibility check fail the test they run in.

import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generatedPassword, uniqueSuffix, type ActorProvider } from '../../helpers/actors';
import type { AppPack } from '../../helpers/app-pack';
import type { QaRuntime } from '../../helpers/config';
import { startFakeApp, type FakeApp } from '../../helpers/__tests__/fake-app';
import { createTest, expect } from '../index';

const ADMIN_USER = 'FAKE_APP_ADMIN_USER';
const ADMIN_PASS = 'FAKE_APP_ADMIN_PASSWORD';

const provider: ActorProvider = {
  async provision({ api, role, worker }) {
    const account = { username: `${role}-${uniqueSuffix(worker)}`, password: generatedPassword() };
    const created = await api.post('api/users', { data: account });
    if (created.status() !== 201) throw new Error(`could not create ${account.username}`);
    return account;
  },
  async signIn({ api, qa, account }) {
    const login = await api.post('api/login', { data: account });
    if (!login.ok()) throw new Error(`login of ${account.username} failed: ${login.status()}`);
    const { token } = (await login.json()) as { token: string };
    return {
      storageState: {
        cookies: [],
        origins: [{ origin: qa.baseUrl, localStorage: [{ name: 'token', value: token }] }],
      },
      apiHeaders: { authorization: `Bearer ${token}` },
      secrets: [token],
    };
  },
  async remove({ api, account, session }) {
    await api.delete(`api/users/${encodeURIComponent(account.username)}`, {
      headers: session.apiHeaders,
    });
  },
};

const test = createTest(provider).extend<object, { fakeApp: FakeApp & { close(): Promise<void> } }>(
  {
    fakeApp: [
      async ({}, use) => {
        const app = await startFakeApp();
        // The existing account, as a pack's .env would name it.
        app.accounts.set('admin', 'fake-admin-pass');
        process.env[ADMIN_USER] = 'admin';
        process.env[ADMIN_PASS] = 'fake-admin-pass';
        await use(app);
        await app.close();
      },
      { scope: 'worker' },
    ],
    qa: [
      async ({ fakeApp }, use) => {
        const qa: QaRuntime = {
          source: 'test',
          environment: 'unit',
          devices: ['desktop-chromium'],
          accessibilityTags: ['wcag2a', 'wcag2aa'],
          testManagement: 'local',
          tracker: { keyPattern: null, issueUrl: null },
          pack: 'fake-app',
          baseUrl: fakeApp.url,
          allowWrites: true,
          recovery: null,
          actors: {
            customer: { account: 'provisioned' },
            admin: { account: 'existing', username_env: ADMIN_USER, password_env: ADMIN_PASS },
          },
          defaultActor: 'customer',
        };
        await use(qa);
      },
      { scope: 'worker' },
    ],
    app: [
      async ({}, use) => {
        const dir = mkdtempSync(join(tmpdir(), 'fake-pack-'));
        const app: AppPack = { name: 'fake-app', version: '1.0.0', title: 'Fake app', dir };
        await use(app);
      },
      { scope: 'worker' },
    ],
    authDir: [mkdtempSync(join(tmpdir(), 'auth-')), { scope: 'worker' }],
  },
);

test('a provisioned actor opens signed in, without the login screen', async ({
  actor,
  fakeApp,
}) => {
  const customer = await actor();
  await customer.page.goto('/');
  await expect(customer.page.getByText(/^Signed in as customer-/)).toBeVisible();
  expect(customer.role).toBe('customer');
  expect(fakeApp.accounts.has(customer.account?.username ?? '')).toBe(true);
  expect(fakeApp.hits.filter((hit) => hit.startsWith('GET /login'))).toEqual([]);
});

test('the API client shares the session of the page', async ({ actor }) => {
  const customer = await actor('customer');
  const me = await customer.api.get('api/me');
  expect(me.status()).toBe(200);
  expect(((await me.json()) as { username: string }).username).toBe(customer.account?.username);
});

test('an existing account, anonymous, and one session per role and worker', async ({
  actor,
  authDir,
}) => {
  const admin = await actor('admin');
  await admin.page.goto('/');
  await expect(admin.page.getByText('Signed in as admin')).toBeVisible();
  const anonymous = await actor('anonymous');
  await anonymous.page.goto('/');
  await expect(anonymous.page.getByText('Signed out')).toBeVisible();
  expect(anonymous.account).toBeNull();
  const files = readdirSync(join(authDir, 'unit', 'fake-app')).sort();
  expect(files.every((file) => /^(admin|customer)-\d+\.json$/.test(file))).toBe(true);
  expect(
    existsSync(join(authDir, 'unit', 'fake-app', `admin-${test.info().workerIndex}.json`)),
  ).toBe(true);
});

test('an unknown role names the roles there are', async ({ actor }) => {
  await expect(actor('guest')).rejects.toThrow(
    /Actor "guest" is not defined .* Known: anonymous, customer, admin/,
  );
});

test('the redaction policy has learned the session secrets', async ({ actor, redaction }) => {
  const customer = await actor();
  expect(redaction.knownSecrets).toContain(customer.account?.password);
  expect(redaction.knownSecrets.length).toBeGreaterThanOrEqual(2);
});

test.describe('the page health guard', () => {
  test('fails a test whose page is broken', async ({ page, fakeApp }) => {
    test.fail(true, 'the guard must turn the broken page into a failure');
    await page.goto(`${fakeApp.url}/broken`);
    await expect(page.getByRole('heading', { name: 'Broken' })).toBeVisible();
  });

  test.describe('switched off with a reason', () => {
    test.use({ pageHealth: { off: 'this test visits the broken page on purpose' } });
    test('lets the same page pass', async ({ page, fakeApp }) => {
      await page.goto(`${fakeApp.url}/broken`);
      await expect(page.getByRole('heading', { name: 'Broken' })).toBeVisible();
    });
  });

  test('also watches the pages of actors', async ({ actor }) => {
    test.fail(true, 'the actor page is broken too');
    const customer = await actor();
    await customer.page.goto('/broken');
  });
});

test.describe('the accessibility check', () => {
  test.use({ pageHealth: { off: 'static pages without the fake application' } });

  test('passes a clean page and fails a seeded violation', async ({ page, a11y }) => {
    await page.setContent(
      '<!doctype html><html lang="en"><head><title>Ok</title></head><body><main><h1>Ok</h1><button>Save</button></main></body></html>',
    );
    const clean = await a11y.expectNoNewViolations(page);
    expect(clean.new).toEqual([]);
    await page.setContent(
      '<!doctype html><html lang="en"><head><title>Bad</title></head><body><main><h1>Bad</h1><button class="icon"></button></main></body></html>',
    );
    await expect(a11y.expectNoNewViolations(page)).rejects.toThrow(
      /1 new accessibility violation\(s\).*\n.*button-name at button/,
    );
  });
});
