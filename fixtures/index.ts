// The core fixtures every app pack builds on. A pack calls `createTest(provider)` in its
// fixtures.ts, adds its own role fixtures (`customer: ({ actor }, use) => ...`), and its specs
// import that `test`. The core never imports a pack.
//
//   qa          worker   the pack's entry in the active environment (from the project's metadata)
//   app         worker   the pack's app.json
//   authDir     worker   where browser states are kept; `.auth/` at the repository root
//   redaction   worker   what evidence must hide: the pack's keys plus every secret the run learned
//   actor       test     actor(role?) opens a signed-in context and page for a role, plus an API
//                        client with the same session; `anonymous` gives a fresh context
//   page        test     Playwright's page, watched by the page health guard
//   pageHealth  option   test.use({ pageHealth: { off: '<why>' } }) switches the guard off
//   a11y        test     a11y.expectNoNewViolations(page) against the pack's baseline
//   visual      test     visual.expectToMatch(target, name, mask) with the pack's settings

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  test as base,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
  type PlaywrightTestOptions,
  type TestInfo,
} from '@playwright/test';
import {
  compareWithBaseline,
  loadBaseline,
  scan,
  violationReport,
  type BaselineComparison,
} from '../helpers/accessibility';
import {
  existingAccount,
  storageStatePath,
  type Account,
  type ActorProvider,
  type SignedIn,
} from '../helpers/actors';
import { loadAppPack, type AppPack } from '../helpers/app-pack';
import {
  actorConfig,
  ANONYMOUS_ACTOR,
  loadRuntime,
  projectPack,
  REPO_ROOT,
  type QaRuntime,
} from '../helpers/config';
import { attachJson } from '../helpers/evidence';
import {
  checkOptions,
  healthReport,
  watchPageHealth,
  type PageHealthGuard,
  type PageHealthOptions,
} from '../helpers/page-health';
import type { RedactionPolicy } from '../helpers/redact';
import { screenshotOptions } from '../helpers/visual';

export { expect };

export interface Actor {
  role: string;
  page: Page;
  context: BrowserContext;
  /** The pack's base URL with the same session as the page. */
  api: APIRequestContext;
  /** The account behind the role; null for `anonymous`. */
  account: Account | null;
}

export interface CoreTestFixtures {
  actor: (role?: string) => Promise<Actor>;
  pageHealth: PageHealthOptions;
  a11y: {
    expectNoNewViolations(
      page: Page,
      options?: { include?: string[]; exclude?: string[] },
    ): Promise<BaselineComparison>;
  };
  visual: {
    expectToMatch(target: Page | Locator, name: string, mask?: Locator[]): Promise<void>;
  };
}

interface Session {
  account: Account;
  signedIn: SignedIn;
  file: string;
  provisioned: boolean;
}

export interface CoreWorkerFixtures {
  qa: QaRuntime;
  app: AppPack;
  authDir: string;
  redaction: RedactionPolicy & { knownSecrets: string[] };
  sessions: { get(role: string): Promise<Session> };
}

// What a new context needs from the project to look like the device the project emulates.
const CONTEXT_KEYS = [
  'baseURL',
  'viewport',
  'screen',
  'userAgent',
  'deviceScaleFactor',
  'isMobile',
  'hasTouch',
  'locale',
  'timezoneId',
  'colorScheme',
  'extraHTTPHeaders',
  'ignoreHTTPSErrors',
] as const;

function projectContextOptions(testInfo: TestInfo): Partial<PlaywrightTestOptions> {
  const use = testInfo.project.use as Record<string, unknown>;
  return Object.fromEntries(
    CONTEXT_KEYS.filter((key) => use[key] !== undefined).map((key) => [key, use[key]]),
  );
}

/**
 * Fail the test with the guard's findings, unless the test switched the guard off. A test that
 * already failed keeps its own error; the findings are attached either way.
 */
async function verifyHealth(
  guard: PageHealthGuard,
  options: PageHealthOptions,
  testInfo: TestInfo,
) {
  if (options.off) return;
  const problems = await guard.problems();
  if (problems.length > 0) await attachJson(testInfo, 'page-health', problems);
  const report = healthReport(problems);
  if (report && testInfo.status === 'passed') throw new Error(report);
}

/** The `test` of a pack: the core fixtures with the pack's way of signing actors in. */
export function createTest(provider: ActorProvider) {
  return base.extend<CoreTestFixtures, CoreWorkerFixtures>({
    qa: [
      async ({}, use, workerInfo) => use(loadRuntime(projectPack(workerInfo.project))),
      { scope: 'worker' },
    ],
    app: [
      async ({ qa }, use) => use(loadAppPack(join(REPO_ROOT, 'apps', qa.pack))),
      { scope: 'worker' },
    ],
    authDir: [join(REPO_ROOT, '.auth'), { scope: 'worker', option: true }],
    redaction: [
      async ({ app }, use) =>
        use({
          secretKeys: app.secret_keys ?? [],
          identityFields: app.identity_fields ?? [],
          knownSecrets: [],
        }),
      { scope: 'worker' },
    ],
    sessions: [
      async ({ qa, authDir, redaction, playwright }, use, workerInfo) => {
        const api = await playwright.request.newContext({ baseURL: `${qa.baseUrl}/` });
        const open = new Map<string, Promise<Session>>();
        const context = (role: string) => ({ api, qa, role, worker: workerInfo.workerIndex });
        const start = async (role: string): Promise<Session> => {
          const config = actorConfig(qa, role);
          if (!config) throw new Error('The anonymous actor has no session.');
          let account: Account;
          if (config.account === 'existing') account = existingAccount(config, role);
          else if (provider.provision) account = await provider.provision(context(role));
          else
            throw new Error(
              `Actor "${role}" is provisioned, but the pack's provider cannot create accounts.`,
            );
          redaction.knownSecrets.push(account.password);
          const signedIn = await provider.signIn({ ...context(role), account });
          redaction.knownSecrets.push(...(signedIn.secrets ?? []));
          const file = storageStatePath(authDir, qa, role, workerInfo.workerIndex);
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, JSON.stringify(signedIn.storageState));
          return { account, signedIn, file, provisioned: config.account === 'provisioned' };
        };
        try {
          await use({
            get(role) {
              if (!open.has(role)) open.set(role, start(role));
              return open.get(role) as Promise<Session>;
            },
          });
        } finally {
          for (const [role, pending] of open) {
            const session = await pending.catch(() => null);
            if (session?.provisioned && provider.remove) {
              await provider.remove({
                ...context(role),
                account: session.account,
                session: session.signedIn,
              });
            }
          }
          await api.dispose();
        }
      },
      { scope: 'worker' },
    ],

    pageHealth: [{}, { option: true }],
    context: async ({ context, qa }, use) => {
      await provider.prepareContext?.(context, qa);
      await use(context);
    },
    page: async ({ page, pageHealth }, use, testInfo) => {
      checkOptions(pageHealth);
      const guard = watchPageHealth(page, pageHealth);
      await use(page);
      await verifyHealth(guard, pageHealth, testInfo);
    },

    actor: async ({ browser, playwright, qa, sessions, pageHealth }, use, testInfo) => {
      checkOptions(pageHealth);
      const opened: { actor: Actor; guard: PageHealthGuard }[] = [];
      await use(async (role = qa.defaultActor) => {
        const options = projectContextOptions(testInfo);
        const session = role === ANONYMOUS_ACTOR ? null : await sessions.get(role);
        const context = await browser.newContext({
          ...options,
          baseURL: `${qa.baseUrl}/`,
          storageState: session?.file,
        });
        await provider.prepareContext?.(context, qa);
        for (const { origin, items } of session?.signedIn.sessionStorage ?? []) {
          await context.addInitScript(
            ({ origin: target, entries }) => {
              if (location.origin !== target) return;
              for (const [name, value] of entries) sessionStorage.setItem(name, value);
            },
            { origin, entries: Object.entries(items) },
          );
        }
        const page = await context.newPage();
        const guard = watchPageHealth(page, pageHealth);
        const api = await playwright.request.newContext({
          baseURL: `${qa.baseUrl}/`,
          storageState: session?.file,
          extraHTTPHeaders: session?.signedIn.apiHeaders,
        });
        const actor: Actor = { role, page, context, api, account: session?.account ?? null };
        opened.push({ actor, guard });
        return actor;
      });
      for (const { actor, guard } of opened) {
        await verifyHealth(guard, pageHealth, testInfo).finally(async () => {
          await actor.api.dispose();
          await actor.context.close();
        });
      }
    },

    a11y: async ({ qa, app, redaction }, use, testInfo) => {
      const baselineFile = join(app.dir, 'a11y-known.json');
      const baseline = loadBaseline(baselineFile);
      await use({
        async expectNoNewViolations(page, options = {}) {
          const { route, violations, results } = await scan(page, {
            tags: qa.accessibilityTags,
            ...options,
          });
          const comparison = compareWithBaseline(violations, baseline, route);
          await attachJson(testInfo, `axe ${route}`, { comparison, results }, redaction);
          const report = violationReport(comparison, baselineFile);
          if (report) throw new Error(report);
          return comparison;
        },
      });
    },

    visual: async ({ app }, use) => {
      await use({
        async expectToMatch(target, name, mask = []) {
          await expect(target as Page).toHaveScreenshot(name, screenshotOptions(app, mask));
        },
      });
    },
  });
}
