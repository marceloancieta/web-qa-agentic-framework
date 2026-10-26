// Answers the shop will not give on demand, for the sign-in and sign-up cases.

import type { Page } from '@playwright/test';
import { delay, failWith } from '../../../helpers/network';

/** The login answers 500. */
export async function loginFails(page: Page): Promise<void> {
  await failWith(page, (url) => url.pathname === '/rest/user/login', 500);
}

/** Hold the login's answer for `ms`, then let the real one through (no `@mocked`). */
export async function slowLogin(page: Page, ms = 2000): Promise<void> {
  await delay(page, (url) => url.pathname === '/rest/user/login', ms);
}

/** The security questions of the sign-up form fail to load. */
export async function securityQuestionsFail(page: Page): Promise<void> {
  await failWith(page, (url) => url.pathname.startsWith('/api/SecurityQuestions'), 500);
}
