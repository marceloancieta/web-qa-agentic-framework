// The Juice Shop pack's `test`: the core fixtures, with Juice Shop's way of creating accounts and
// signing them in, and one fixture per role.
//
// Signing in mirrors what the frontend does after its own login: the token goes to local storage
// and to a `token` cookie, and the basket id to session storage. Every context also gets the
// cookies that dismiss the welcome and cookie banners, so no test has to click them away.
// Accounts are not removed: Juice Shop has no endpoint for it, and the container starts empty on
// every restart (`npm run juice-shop:up` after `juice-shop:down`, or the pack's recovery).

import type { BrowserContext } from '@playwright/test';
import type { ActorProvider } from '../../helpers/actors';
import { createTest, expect, type Actor } from '../../fixtures';
import { AccountApi } from './api/account-api';
import { aCustomer } from './builders/account-builder';

export const BANNER_COOKIES = ['welcomebanner_status', 'cookieconsent_status'];

async function dismissBanners(context: BrowserContext, baseUrl: string): Promise<void> {
  await context.addCookies(
    BANNER_COOKIES.map((name) => ({ name, value: 'dismiss', url: baseUrl })),
  );
}

export const provider: ActorProvider = {
  prepareContext: (context, qa) => dismissBanners(context, qa.baseUrl),

  async provision({ api, role, worker }) {
    const account = aCustomer(role, worker);
    const created = await new AccountApi(api).register(account);
    return { ...account, id: String(created.id) };
  },

  async signIn({ api, qa, account }) {
    const { token, bid } = await new AccountApi(api).login(account);
    const { hostname } = new URL(qa.baseUrl);
    return {
      storageState: {
        cookies: [
          {
            name: 'token',
            value: token,
            domain: hostname,
            path: '/',
            expires: -1,
            httpOnly: false,
            secure: false,
            sameSite: 'Lax',
          },
        ],
        origins: [{ origin: qa.baseUrl, localStorage: [{ name: 'token', value: token }] }],
      },
      apiHeaders: { Authorization: `Bearer ${token}` },
      secrets: [token],
      sessionStorage: [{ origin: qa.baseUrl, items: { bid: String(bid) } }],
    };
  },
};

export const test = createTest(provider).extend<{ customer: Actor }>({
  customer: async ({ actor }, use) => use(await actor('customer')),
});

export { expect };
