// The session where the application keeps it: a `session-username` cookie that holds the user
// name, written by the login form and removed by Logout (docs/app-notes.md). Swag Labs has no API,
// so starting a session is writing that cookie; the actor provider does it before a case starts,
// and a case that needs a new session of the same account partway through does it here, without
// typing a password.

import type { BrowserContext } from '@playwright/test';

/** The cookie the application reads to decide whether someone is signed in. */
export const SESSION_COOKIE = 'session-username';

/** The session cookie of an account, for the application at `baseUrl`. */
export function sessionCookie(baseUrl: string, username: string) {
  return {
    name: SESSION_COOKIE,
    value: username,
    domain: new URL(baseUrl).hostname,
    path: '/',
    // The application gives it 10 minutes; a browser-session cookie keeps a long run signed in.
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax' as const,
  };
}

/** Start a new session of the account in this context, as the login form would. */
export async function startSession(
  context: BrowserContext,
  baseUrl: string,
  username: string,
): Promise<void> {
  await context.addCookies([sessionCookie(baseUrl, username)]);
}
