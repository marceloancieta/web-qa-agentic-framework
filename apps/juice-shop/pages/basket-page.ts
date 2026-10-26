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

  /**
   * A row's cells are image, name, quantity (with a decrease and an increase button around it),
   * price, and a cell with the remove button. None of the three buttons has an accessible name, so
   * they are found by their place in the row (a finding of the W8b2 gate).
   */
  quantity(name: string): Locator {
    return this.row(name).getByRole('cell').nth(2); // the third cell is the quantity
  }

  decrease(name: string): Locator {
    return this.quantity(name).getByRole('button').first(); // the button before the number
  }

  increase(name: string): Locator {
    return this.quantity(name).getByRole('button').last(); // the button after the number
  }

  remove(name: string): Locator {
    return this.row(name).getByRole('cell').last().getByRole('button'); // the last cell holds it
  }

  /** A notification such as "You can order only up to 5 items of this product.". */
  notification(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  /** The text that names the products' bonus points: "You will gain <n> Bonus Points…". */
  bonus(): Locator {
    return this.page.getByText(/^You will gain \d+ Bonus Points from this order!$/);
  }

  total(): Locator {
    return this.page.getByText(/^Total Price: /);
  }

  /** The total when it reads exactly `text`, for a watch on a state that must never show. */
  totalReading(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  /** The bonus line when it reads exactly `text`, for a watch on a state that must never show. */
  bonusReading(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  checkout(): Locator {
    return this.page.getByRole('button', { name: 'Checkout' });
  }
}
