// The core fixtures with a provider for the fake application: actors start signed in without the
// login screen, the browser state is kept per worker, the API client shares the session, and the
// page health guard and the accessibility check fail the test they run in.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
      sessionStorage: [{ origin: qa.baseUrl, items: { basket: `basket-of-${account.username}` } }],
    };
  },
  async prepareContext(context, qa) {
    await context.addCookies([{ name: 'banner', value: 'dismissed', url: qa.baseUrl }]);
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
          pairwise: false,
          accessibilityTags: ['wcag2a', 'wcag2aa'],
          testManagement: 'local',
          tracker: { keyPattern: null, issueUrl: null },
          pack: 'fake-app',
          baseUrl: fakeApp.url,
          allowWrites: true,
          recovery: null,
          // The unit project has no device, so its own name keys the budget.
          performance: {
            web_vitals: { samples: 3, budgets: { unit: { lcp_ms: 2500, cls: 0.1, inp_ms: 200 } } },
          },
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
        // The fake app answers on 127.0.0.1; `localhost` reaches the same server under another
        // host, which stands in for a third party that would answer if it were not blocked.
        const app: AppPack = {
          name: 'fake-app',
          version: '1.0.0',
          title: 'Fake app',
          dir,
          third_party_hosts: ['localhost'],
        };
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

test("a fresh actor has an account of its own and leaves the worker's state alone", async ({
  actor,
  authDir,
  fakeApp,
}) => {
  const shared = await actor('customer');
  const file = join(authDir, 'unit', 'fake-app', `customer-${test.info().workerIndex}.json`);
  const before = readFileSync(file, 'utf8');
  const own = await actor('customer', { fresh: true });
  const other = await actor('customer', { fresh: true });
  const names = [shared, own, other].map((a) => a.account?.username);
  expect(new Set(names).size).toBe(3);
  expect(fakeApp.accounts.has(own.account?.username ?? '')).toBe(true);
  const me = await own.api.get('api/me');
  expect(((await me.json()) as { username: string }).username).toBe(own.account?.username);
  await own.page.goto('/');
  await expect(own.page.getByText(`Signed in as ${own.account?.username}`)).toBeVisible();
  expect(readFileSync(file, 'utf8')).toBe(before);
  await expect(actor('admin', { fresh: true })).rejects.toThrow(/only a provisioned role/);
  await expect(actor('anonymous', { fresh: true })).rejects.toThrow(/has no account/);
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

test('every context is prepared, and actors get their session storage', async ({
  actor,
  page,
  fakeApp,
}) => {
  await page.goto(`${fakeApp.url}/`);
  expect(await page.evaluate(() => document.cookie)).toContain('banner=dismissed');
  expect(await page.evaluate(() => sessionStorage.getItem('basket'))).toBeNull();
  const customer = await actor();
  await customer.page.goto('/');
  expect(await customer.page.evaluate(() => document.cookie)).toContain('banner=dismissed');
  expect(await customer.page.evaluate(() => sessionStorage.getItem('basket'))).toBe(
    `basket-of-${customer.account?.username}`,
  );
});

test("the pack's third-party hosts are blocked in every context, its own host is not", async ({
  actor,
  page,
  fakeApp,
}) => {
  const thirdParty = fakeApp.url.replace('127.0.0.1', 'localhost');
  const reach = (target: string) =>
    fetch(target, { mode: 'no-cors' }).then(
      () => 'answered',
      () => 'blocked',
    );
  await page.goto(`${fakeApp.url}/`);
  expect(await page.evaluate(reach, `${fakeApp.url}/`)).toBe('answered');
  expect(await page.evaluate(reach, `${thirdParty}/`)).toBe('blocked');
  const customer = await actor();
  await customer.page.goto('/');
  expect(await customer.page.evaluate(reach, `${fakeApp.url}/`)).toBe('answered');
  expect(await customer.page.evaluate(reach, `${thirdParty}/`)).toBe('blocked');
});

test('a view that must differ from a baseline: missing and matching fail, a difference passes, nothing is written', async ({
  page,
  visual,
}, testInfo) => {
  const name = 'must-differ.png';
  const baseline = testInfo.snapshotPath(name, { kind: 'screenshot' });
  const root = join(testInfo.project.testDir, 'visual', testInfo.project.name);
  expect(baseline.startsWith(root)).toBe(true);
  const rootExisted = existsSync(root);
  const box = (color: string) =>
    page.setContent(
      `<!doctype html><html lang="en"><head><title>Box</title></head><body style="margin:0">` +
        `<div style="width:120px;height:80px;background:${color}"></div></body></html>`,
    );
  try {
    await box('red');
    await expect(visual.expectNotToMatch(page, name)).rejects.toThrow(/doesn't exist/);
    expect(existsSync(baseline)).toBe(false);

    mkdirSync(dirname(baseline), { recursive: true });
    await page.screenshot({ path: baseline, animations: 'disabled', caret: 'hide', scale: 'css' });
    const written = readFileSync(baseline);
    await expect(visual.expectNotToMatch(page, name)).rejects.toThrow(/should be different/);

    await box('blue');
    await visual.expectNotToMatch(page, name);
    expect(readFileSync(baseline).equals(written)).toBe(true);
  } finally {
    rmSync(rootExisted ? baseline : root, { recursive: true, force: true });
  }
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

test('web vitals: every visit in a new context of the role, the medians judged and attached', async ({
  vitals,
  fakeApp,
}, testInfo) => {
  const before = fakeApp.hits.filter((hit) => hit === 'GET /').length;
  const { budget, medians } = await vitals.expectWithinBudget('/', async (page) => {
    await page.goto('/');
    await expect(page.getByText('Signed out')).toBeVisible();
    await page.getByRole('heading', { name: 'Account' }).click();
  });
  expect(budget).toEqual({ lcp_ms: 2500, cls: 0.1, inp_ms: 200 });
  expect(medians.lcpMs).not.toBeNull();
  expect(medians.inpMs).not.toBeNull();
  expect(fakeApp.hits.filter((hit) => hit === 'GET /').length - before).toBe(3);
  expect(testInfo.attachments.map((a) => a.name)).toContain('web vitals /');
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

test.describe('the security headers check', () => {
  test('passes a page with every header and fails a seeded page missing one', async ({
    page,
    fakeApp,
    securityHeaders,
  }) => {
    await page.goto(`${fakeApp.url}/headers`);
    const healthy = await securityHeaders.expectNoNewGaps(page);
    expect(healthy).toEqual({ new: [], known: [], gone: [] });
    await page.goto(`${fakeApp.url}/headers?omit=content-security-policy`);
    await expect(securityHeaders.expectNoNewGaps(page)).rejects.toThrow(
      /^1 new security header gap\(s\):\n {2}content-security-policy on \/headers\?omit=content-security-policy: no Content-Security-Policy header\n/,
    );
  });

  test("checks the pages of actors too, and refuses a page that loaded no document of the pack's", async ({
    actor,
    securityHeaders,
  }) => {
    const customer = await actor();
    await customer.page.goto('/headers?omit=x-content-type-options');
    await expect(securityHeaders.expectNoNewGaps(customer.page)).rejects.toThrow(
      /x-content-type-options on \/headers\?omit=x-content-type-options/,
    );
    const blank = await customer.context.newPage();
    await expect(securityHeaders.expectNoNewGaps(blank)).rejects.toThrow(/is not recorded/);
    const anonymous = await actor('anonymous');
    await anonymous.page.setContent('<!doctype html><title>t</title><h1>t</h1>');
    await expect(securityHeaders.expectNoNewGaps(anonymous.page)).rejects.toThrow(
      /loaded no document of http:\/\/127\.0\.0\.1:\d+ yet/,
    );
  });
});
