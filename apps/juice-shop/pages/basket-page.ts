// The basket (`/#/basket`): a table with a row per product, the total and Checkout.

import type { Locator, Page, Response } from '@playwright/test';

export class BasketPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('#/basket');
  }

  /**
   * Resolves when the basket's contents have answered. Start it before opening the page: until
   * then the table has no rows whatever the basket holds.
   */
  contentsLoaded(): Promise<Response> {
    return this.page.waitForResponse((r) => /\/rest\/basket\/\d+$/.test(new URL(r.url()).pathname));
  }

  /** The card the page's content sits on. */
  card(): Locator {
    return this.page.locator('mat-card').first(); // no role or name; the page's only outer card
  }

  title(): Locator {
    return this.page.getByRole('heading', { level: 1, name: /^Your Basket/ });
  }

  /** What a screenshot of the basket masks: the title holds the account's email. */
  visualMasks(): Locator[] {
    return [this.title()];
  }

  /**
   * The row of a product: the one with a cell named exactly after it. Text inside the row would
   * not do, since one name can sit inside another ("Apple Juice (1000ml)" in "Pineapple Juice
   * (1000ml)") and a text filter ignores case.
   */
  row(name: string): Locator {
    return this.page
      .getByRole('row')
      .filter({ has: this.page.getByRole('cell', { name, exact: true }) });
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
   * they are found by their place in the row (BASKET G4 in the basket contract).
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

  name(name: string): Locator {
    return this.row(name).getByRole('cell').nth(1); // the second cell is the name
  }

  price(name: string): Locator {
    return this.row(name).getByRole('cell').nth(3); // the fourth cell is the price
  }

  columnHeaders(): Locator {
    return this.page.getByRole('table').getByRole('columnheader');
  }

  images(): Locator {
    return this.page.getByRole('table').getByRole('img');
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
