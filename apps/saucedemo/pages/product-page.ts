// One product's page, `/inventory-item.html?id=<n>`. An unknown or missing id shows a page for a
// product named "ITEM NOT FOUND".

import type { Locator, Page } from '@playwright/test';
import { Header } from '../components/header';

export class ProductPage {
  readonly header: Header;

  constructor(private readonly page: Page) {
    this.header = new Header(page);
  }

  /** Open a product by its id, or the page without an id when none is given. */
  async open(id?: number | string): Promise<void> {
    await this.page.goto(id === undefined ? 'inventory-item.html' : `inventory-item.html?id=${id}`);
  }

  /** The product's image, named after the product. */
  image(): Locator {
    return this.page.getByRole('main').getByRole('img');
  }

  name(): Locator {
    // The name, description and price are plain text without a role; the test ids are the next
    // locators in the order.
    return this.page.getByTestId('inventory-item-name');
  }

  description(): Locator {
    return this.page.getByTestId('inventory-item-desc');
  }

  price(): Locator {
    return this.page.getByTestId('inventory-item-price');
  }

  /** "Add to cart" or "Remove", whichever the page shows. */
  cartAction(): Locator {
    return this.page.getByRole('main').getByRole('button', { name: /^(Add to cart|Remove)$/ });
  }

  async addToCart(): Promise<void> {
    await this.page
      .getByRole('main')
      .getByRole('button', { name: 'Add to cart', exact: true })
      .click();
  }

  backButton(): Locator {
    return this.page.getByRole('button', { name: 'Back to products' });
  }

  async back(): Promise<void> {
    await this.backButton().click();
  }
}
