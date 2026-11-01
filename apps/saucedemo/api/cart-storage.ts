// The cart where the application keeps it: local storage, under `cart-contents`, as a JSON array
// of product ids (docs/app-notes.md). Swag Labs has no API, so this is how a case prepares a cart
// before the page opens and checks what the page claims to have done.

import type { BrowserContext, Page } from '@playwright/test';
import type { Product } from '../builders/products';

export const CART_KEY = 'cart-contents';

export class CartStorage {
  constructor(private readonly page: Page) {}

  /**
   * Put products in the cart of a context before its first page loads. The cart is written once,
   * on the first page the context opens, so a reload or a later page shows what the case did to it
   * since, not the prepared cart again.
   */
  static async prepare(context: BrowserContext, products: readonly Product[]): Promise<void> {
    await context.addInitScript(
      ({ key, value }) => {
        const marker = 'qa-cart-prepared';
        // A blank page before the first navigation has no storage of the application's.
        if (!location.protocol.startsWith('http') || sessionStorage.getItem(marker)) return;
        localStorage.setItem(key, value);
        sessionStorage.setItem(marker, '1');
      },
      { key: CART_KEY, value: JSON.stringify(products.map((product) => product.id)) },
    );
  }

  /** The product ids in the cart, in the order they were added; empty when there is no cart. */
  async ids(): Promise<number[]> {
    const raw = await this.page.evaluate((key) => localStorage.getItem(key), CART_KEY);
    return raw === null ? [] : (JSON.parse(raw) as number[]);
  }
}
