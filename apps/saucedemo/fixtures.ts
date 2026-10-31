// The Swag Labs pack's `test`: the core fixtures, with this application's way of signing an
// existing account in, and one fixture per role.
//
// Swag Labs has no API: its login runs in the browser, checks the account against a list built into
// its script and keeps the session in a `session-username` cookie that holds the user name. Signing
// in builds that cookie, so no case but the login form's own types a password. The application
// sets the cookie to expire after 10 minutes; here it lasts for the browser session instead, so a
// long run does not lose its sign-in halfway (apps/saucedemo/docs/app-notes.md).

import type { ActorProvider } from '../../helpers/actors';
import { createTest, expect, type Actor } from '../../fixtures';

/** The cookie the application reads to decide whether someone is signed in. */
export const SESSION_COOKIE = 'session-username';

export const provider: ActorProvider = {
  async signIn({ qa, account }) {
    const { hostname } = new URL(qa.baseUrl);
    return {
      storageState: {
        cookies: [
          {
            name: SESSION_COOKIE,
            value: account.username,
            domain: hostname,
            path: '/',
            expires: -1,
            httpOnly: false,
            secure: false,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      },
    };
  },
};

export const test = createTest(provider).extend<{ standard: Actor }>({
  standard: async ({ actor }, use) => use(await actor('standard')),
});

export { expect, type Actor };
