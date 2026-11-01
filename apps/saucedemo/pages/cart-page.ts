// The cart, `/cart.html`: one row per product in it, then Continue Shopping and Checkout.

import type { Locator, Page } from '@playwright/test';
import { Header } from '../components/header';

export class CartPage {
  readonly header: Header;

  constructor(private readonly page: Page) {
    this.header = new Header(page);
  }

  async open(): Promise<void> {
    await this.page.goto('cart.html');
  }

  /** One row per product in the cart. */
  rows(): Locator {
    // A row is a plain container without a role (contract G6); its test id is the next locator.
    return this.page.getByTestId('inventory-item');
  }

  /** The names of the products in the cart, in the order of the rows. */
  names(): Locator {
    return this.page.getByTestId('inventory-item-name');
  }

  descriptions(): Locator {
    return this.page.getByTestId('inventory-item-desc');
  }

  prices(): Locator {
    return this.page.getByTestId('inventory-item-price');
  }

  quantities(): Locator {
    return this.page.getByTestId('item-quantity');
  }

  /** "QTY" and "Description", plain text above the rows rather than column headers (G6). */
  columnLabels(): Locator {
    return this.page
      .getByTestId('cart-quantity-label')
      .or(this.page.getByTestId('cart-desc-label'));
  }

  /** The row of one product, found by its name. */
  row(name: string): Locator {
    return this.rows().filter({
      has: this.page.getByTestId('inventory-item-name').getByText(name, { exact: true }),
    });
  }

  /** The "Remove" button of one product's row. */
  removeButton(name: string): Locator {
    return this.row(name).getByRole('button', { name: 'Remove', exact: true });
  }

  async remove(name: string): Promise<void> {
    await this.removeButton(name).click();
  }

  removeButtons(): Locator {
    return this.page.getByRole('main').getByRole('button', { name: 'Remove', exact: true });
  }

  async openProduct(name: string): Promise<void> {
    await this.row(name)
      .getByRole('button', { name: `View details for ${name}`, exact: true })
      .click();
  }

  continueShoppingButton(): Locator {
    return this.page.getByRole('button', { name: 'Continue Shopping' });
  }

  checkoutButton(): Locator {
    return this.page.getByRole('button', { name: 'Checkout' });
  }

  async continueShopping(): Promise<void> {
    await this.continueShoppingButton().click();
  }

  async checkout(): Promise<void> {
    await this.checkoutButton().click();
  }
}
