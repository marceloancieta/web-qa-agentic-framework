// The basket (`/#/basket`): a table with a row per product, the total and Checkout.

import type { Locator, Page } from '@playwright/test';

export class BasketPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('#/basket');
  }

  /**
   * Resolves when the basket's contents have answered. Start it before opening the page: until
   * then the table has no rows whatever the basket holds.
   */
  contentsLoaded(): Promise<unknown> {
    return this.page.waitForResponse((r) => /\/rest\/basket\/\d+$/.test(new URL(r.url()).pathname));
  }

  title(): Locator {
    return this.page.getByRole('heading', { level: 1, name: /^Your Basket/ });
  }

  /** The row of a product, named after it. */
  row(name: string): Locator {
    return this.page.getByRole('row').filter({ hasText: name });
  }

  rows(): Locator {
    return this.page
      .getByRole('table')
      .getByRole('row')
      .filter({ has: this.page.getByRole('cell') });
  }

  total(): Locator {
    return this.page.getByText(/^Total Price: /);
  }

  checkout(): Locator {
    return this.page.getByRole('button', { name: 'Checkout' });
  }
}
