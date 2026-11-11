// The Spree Commerce admin pack's `test`: the core fixtures with Spree's way of signing staff in,
// and one fixture per role.
//
// Signing in goes through the admin API, as the dashboard's own form does: the refresh cookie it
// sets is the session the dashboard opens with. Spree rotates that cookie on its first use and
// refuses it afterwards, so the sessions are single-use and the core signs in again for each
// context (helpers/session-store.ts). The `admin` actor is an existing account that
// `npm run spree:up` makes from the variables qa-config names.

import type { ActorProvider } from '../../helpers/actors';
import { createTest, expect, type Actor } from '../../fixtures';
import { AuthApi, REFRESH_COOKIE } from './api/auth-api';

export const provider: ActorProvider = {
  singleUseSessions: true,

  async signIn({ api, qa, account }) {
    const { token, refresh } = await new AuthApi(api).login(account);
    return {
      storageState: {
        cookies: [
          {
            name: REFRESH_COOKIE,
            value: refresh.value,
            domain: new URL(qa.baseUrl).hostname,
            path: refresh.path,
            expires: refresh.expires,
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      },
      apiHeaders: { Authorization: `Bearer ${token}` },
      secrets: [token, refresh.value],
    };
  },
};

export const test = createTest(provider).extend<{ admin: Actor }>({
  admin: async ({ actor }, use) => use(await actor('admin')),
});

export { expect, type Actor };
