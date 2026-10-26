// Answers the shop will not give on demand, for the search and basket cases.

import type { Page } from '@playwright/test';
import { delay, failWith, mockJson } from '../../../helpers/network';

/** The product search, which the page asks for the whole catalogue. */
export const PRODUCT_SEARCH = /\/rest\/products\/search(?:\?|$)/;
/** The stock the search page asks for beside the catalogue; it aborts when the catalogue fails. */
export const STOCK = /\/api\/Quantitys\/?(?:\?|$)/;
const isProductSearch = (url: URL) => PRODUCT_SEARCH.test(url.pathname + url.search);
const BASKET = (url: URL) => /^\/rest\/basket\/\d+$/.test(url.pathname);

/** The product search answers 500. */
export async function searchFails(page: Page): Promise<void> {
  await failWith(page, isProductSearch, 500);
}

/** The product search answers an empty catalogue. */
export async function emptyCatalogue(page: Page): Promise<void> {
  await mockJson(page, isProductSearch, { status: 'success', data: [] });
}

/** Hold the product search's answer for `ms`, then let the real one through (no `@mocked`). */
export async function slowSearch(page: Page, ms = 2000): Promise<void> {
  await delay(page, isProductSearch, ms);
}

/** The basket answers 500. */
export async function basketFails(page: Page): Promise<void> {
  await failWith(page, BASKET, 500);
}
