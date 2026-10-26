// The page after an order is placed (`/#/order-completion/<ORDER_ID>`): a product table, then a row
// that holds two inner tables side by side, the amounts' labels and their values.

import type { Locator, Page } from '@playwright/test';
import { rowStartingWith } from './row-name';

const AMOUNTS = ['Items', 'Delivery', 'Promotion', 'Total Price'] as const;
export type CompletionAmount = (typeof AMOUNTS)[number];

export class OrderCompletionPage {
  constructor(private readonly page: Page) {}

  heading(): Locator {
    return this.page.getByRole('heading', { name: 'Thank you for your purchase!' });
  }

  /** The order id, from the page's address. */
  orderId(): string {
    const id = /#\/order-completion\/([^/?]+)/.exec(this.page.url())?.[1];
    if (!id) throw new Error(`Not on an order completion page: ${this.page.url()}`);
    return id;
  }

  product(name: string): Locator {
    return this.page.getByRole('row', { name: rowStartingWith(name) });
  }

  /**
   * The value of an amount. The labels and the values are two inner tables of one row, in the same
   * order: the value is the inner cell holding one amount at the label's position.
   */
  amount(label: CompletionAmount): Locator {
    return this.page
      .getByRole('row', { name: /^Items Delivery Promotion Total Price / })
      .getByRole('cell', { name: /^\d+\.\d{2}¤$/ })
      .nth(AMOUNTS.indexOf(label)); // the values follow the labels' order
  }

  /** The line that gives the delivery days ("Your order will be delivered in <n> days."). */
  deliveryDays(): Locator {
    return this.page.getByText(/Your order will be delivered in \d+ days?\./);
  }

  /** Template text the page shows before its data arrives, such as `{{bonus}}` (LOCAL-13). */
  templateText(): Locator {
    return this.page.getByText(/\{\{\s*\w+\s*\}\}/);
  }

  trackOrders(): Locator {
    return this.page.getByRole('link', { name: 'Track Orders' });
  }
}
