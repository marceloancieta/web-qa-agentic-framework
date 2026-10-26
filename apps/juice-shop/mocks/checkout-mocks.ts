// Answers the shop will not give on demand, for the checkout cases: a failed save, a slow answer.

import type { Page } from '@playwright/test';
import { delay, failWith } from '../../../helpers/network';

/** Saving a new address; the list of addresses is `GET /api/Addresss`, without the slash. */
export const ADDRESS_SAVE = /\/api\/Addresss\/$/;

/** Saving a new address answers 500. */
export async function addressSaveFails(page: Page): Promise<void> {
  await failWith(page, (url) => ADDRESS_SAVE.test(url.pathname), 500);
}

/**
 * Resolves when an address save has been answered, the mocked failure included. Start it before
 * pressing Submit: it is the sign the page has the answer, whatever it then shows.
 */
export function addressSaveAnswered(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (r) => r.request().method() === 'POST' && ADDRESS_SAVE.test(new URL(r.url()).pathname),
  );
}

/** Hold the basket's answer for `ms`, then let the real one through (no `@mocked`). */
export async function slowBasket(page: Page, ms = 2000): Promise<void> {
  await delay(page, (url) => /^\/rest\/basket\/\d+$/.test(url.pathname), ms);
}

/**
 * Hold the order's answer on the completion page (`GET /rest/track-order/<ORDER_ID>`) for `ms`,
 * then let the real one through (no `@mocked`).
 */
export async function slowOrder(page: Page, ms = 2000): Promise<void> {
  await delay(page, (url) => url.pathname.startsWith('/rest/track-order/'), ms);
}
