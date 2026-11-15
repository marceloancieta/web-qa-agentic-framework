// The sign-in call, held back or watched, for the cases about the sign-in form. The URL patterns
// are exported for the page health guard's `allowRequests`.

import type { Page } from '@playwright/test';
import { delay } from '../../../helpers/network';

/** The sign-in call the form sends. */
export const SIGN_IN = /\/api\/v3\/admin\/auth\/login$/;

/** The refresh the dashboard sends on every page load; `401` without a session. */
export const REFRESH = /\/api\/v3\/admin\/auth\/refresh$/;

/** Hold the sign-in's answer for `ms`, then let the real one through (no `@mocked`). */
export async function slowSignIn(page: Page, ms = 2_000): Promise<void> {
  await delay(page, (url) => SIGN_IN.test(url.pathname), ms);
}

/** Count the sign-in requests the page sends from now on. */
export function watchSignIns(page: Page): { sent(): number } {
  let sent = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && SIGN_IN.test(new URL(request.url()).pathname)) sent += 1;
  });
  return { sent: () => sent };
}
