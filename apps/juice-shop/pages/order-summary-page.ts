// The order summary (`/#/order-summary`): the chosen address and card, the products, and a table of
// amounts. "Order Summary" is plain text, not a heading (LOCAL-11).

import type { Locator, Page } from '@playwright/test';
import { rowStartingWith } from './row-name';

export type Amount = 'Items' | 'Delivery' | 'Promotion' | 'Total Price';

export class OrderSummaryPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('#/order-summary');
  }

  /** The title as text, which it is today (LOCAL-11); it keeps matching once it is a heading. */
  title(): Locator {
    return this.page.getByText('Order Summary', { exact: true });
  }

  /** The title as a heading, which it is not until LOCAL-11 is fixed. */
  heading(): Locator {
    return this.page.getByRole('heading', { name: 'Order Summary' });
  }

  /** A product's row, named after the product. */
  product(name: string): Locator {
    return this.page.getByRole('row', { name: rowStartingWith(name) });
  }

  /** Every product row: a row of the products table holds the product's image. */
  productRows(): Locator {
    return this.page.getByRole('row').filter({ has: this.page.getByRole('img') });
  }

  /**
   * The products table while it holds no product: the table that has neither a product image nor
   * the amounts' labels (LOCAL-13 shows it before the basket answers).
   */
  emptyProductsTable(): Locator {
    return this.page
      .getByRole('table')
      .filter({ hasNot: this.page.getByRole('img') })
      .filter({ hasNotText: /Items|Total Price/ });
  }

  /** A product row's cells are image, name, quantity and price, in that order. */
  productQuantity(name: string): Locator {
    return this.product(name).getByRole('cell').nth(2); // the third cell is the quantity
  }

  productPrice(name: string): Locator {
    return this.product(name).getByRole('cell').nth(3); // the fourth cell is the price
  }

  productImage(name: string): Locator {
    return this.page.getByRole('img', { name, exact: true });
  }

  /** The value cell of an amount: the row is named "<label> <value>". */
  amount(label: Amount): Locator {
    return this.page
      .getByRole('row', { name: new RegExp(`^${label} `) })
      .getByRole('cell')
      .last(); // the label's row has two cells, the label and its value
  }

  /** A part of what the summary repeats about the address or the card ("Card ending in 1234"). */
  shows(part: string | RegExp): Locator {
    return this.page.getByText(part, { exact: false });
  }

  /** Shows "Place your order and pay" (LOCAL-10). */
  placeOrder(): Locator {
    return this.page.getByRole('button', { name: 'Complete your purchase' });
  }

  /**
   * The same button found by the text it shows, for a case about its accessible name: it keeps
   * matching when LOCAL-10 renames it.
   */
  placeOrderByText(): Locator {
    return this.page.getByRole('button').filter({ hasText: 'Place your order and pay' });
  }

  /**
   * Resolves with the status of the checkout's answer. Start it before pressing placeOrder(): the
   * answer can take seconds under load, longer than a URL check waits.
   */
  async orderAnswered(): Promise<number> {
    const response = await this.page.waitForResponse(
      (r) => /^\/rest\/basket\/\d+\/checkout$/.test(new URL(r.url()).pathname),
      { timeout: 30_000 },
    );
    return response.status();
  }
}
