// The product search (`/#/search`): one `article` per product, named by nothing but holding the
// product's image (its name as the alternative text), its price and Add to Basket.

import type { Locator, Page } from '@playwright/test';

export class SearchPage {
  constructor(private readonly page: Page) {}

  async open(term?: string): Promise<void> {
    await this.page.goto(
      term === undefined ? '#/search' : `#/search?q=${encodeURIComponent(term)}`,
    );
  }

  /** The card of a product, by its exact name. */
  product(name: string): Locator {
    return this.page
      .getByRole('article')
      .filter({ has: this.page.getByRole('img', { name, exact: true }) });
  }

  addToBasket(name: string): Locator {
    return this.product(name).getByRole('button', { name: 'Add to Basket' });
  }

  /** The notification a basket change answers with. */
  notification(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }
}
