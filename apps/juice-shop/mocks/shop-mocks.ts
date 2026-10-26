// Answers the shop will not give on demand, for the search and basket cases.

import type { Page } from '@playwright/test';
import { delay, failWith, mockJson } from '../../../helpers/network';

const PRODUCT_SEARCH = (url: URL) => url.pathname === '/rest/products/search';
const BASKET = (url: URL) => /^\/rest\/basket\/\d+$/.test(url.pathname);

/** The product search answers 500. */
export async function searchFails(page: Page): Promise<void> {
  await failWith(page, PRODUCT_SEARCH, 500);
}

/** The product search answers an empty catalogue. */
export async function emptyCatalogue(page: Page): Promise<void> {
  await mockJson(page, PRODUCT_SEARCH, { status: 'success', data: [] });
}

/** Hold the product search's answer for `ms`, then let the real one through (no `@mocked`). */
export async function slowSearch(page: Page, ms = 2000): Promise<void> {
  await delay(page, PRODUCT_SEARCH, ms);
}

/** The basket answers 500. */
export async function basketFails(page: Page): Promise<void> {
  await failWith(page, BASKET, 500);
}
