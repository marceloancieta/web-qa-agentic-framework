// The Juice Shop pack's `test`: the core fixtures, with Juice Shop's way of creating accounts and
// signing them in, and one fixture per role.
//
// Signing in mirrors what the frontend does after its own login: the token goes to local storage
// and to a `token` cookie, and the basket id to session storage. The cookies that dismiss the
// welcome and cookie banners and fix the language are in app.json `cookies`, which the core adds to
// every context: without the language cookie the shop picks a language on load and announces the
// change in a notification that may or may not be on screen when a check runs.
// Accounts are not removed: Juice Shop has no endpoint for it, and the container starts empty on
// every restart (`npm run juice-shop:up` after `juice-shop:down`, or the pack's recovery).

import type { ActorProvider } from '../../helpers/actors';
import { createTest, expect, type Actor } from '../../fixtures';
import { AccountApi } from './api/account-api';
import { aCustomer } from './builders/account-builder';

export const provider: ActorProvider = {
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
