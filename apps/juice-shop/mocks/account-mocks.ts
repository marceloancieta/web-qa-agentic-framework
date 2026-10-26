// Answers the shop will not give on demand, for the sign-in and sign-up cases. The URL patterns are
// exported for the page health guard's `allowRequests`, when the failure is what the case is about.

import type { Page } from '@playwright/test';
import { delay, failWith } from '../../../helpers/network';

/** The login call. */
export const LOGIN = /\/rest\/user\/login$/;

/** The security questions the sign-up form loads. */
export const SECURITY_QUESTIONS = /\/api\/SecurityQuestions\/?(?:\?|$)/;

/** The login answers 500. */
export async function loginFails(page: Page): Promise<void> {
  await failWith(page, (url) => LOGIN.test(url.pathname), 500);
}

/** Hold the login's answer for `ms`, then let the real one through (no `@mocked`). */
export async function slowLogin(page: Page, ms = 2000): Promise<void> {
  await delay(page, (url) => LOGIN.test(url.pathname), ms);
}

/** The security questions of the sign-up form fail to load. */
export async function securityQuestionsFail(page: Page): Promise<void> {
  await failWith(page, (url) => SECURITY_QUESTIONS.test(url.pathname + url.search), 500);
}
