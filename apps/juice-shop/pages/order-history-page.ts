// The order history (`/#/order-history`) and the tracking page it leads to. Neither has a heading
// for its content (LOCAL-11): the history's title is plain text.

import type { Locator, Page } from '@playwright/test';
import { rowStartingWith } from './row-name';

export class OrderHistoryPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('#/order-history');
  }

  /** The title as text, which it is today (LOCAL-11); it keeps matching once it is a heading. */
  title(): Locator {
    return this.page.getByText('Order History', { exact: true });
  }

  /** The title as a heading, which it is not until LOCAL-11 is fixed. */
  heading(): Locator {
    return this.page.getByRole('heading', { name: 'Order History' });
  }

  /** The line of an order: "Order ID #<id>". */
  order(orderId: string): Locator {
    return this.page.getByText(`#${orderId}`, { exact: true });
  }

  /** A text of the order's summary line, such as its total "2.98¤" or "In Transit". */
  shows(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  product(name: string): Locator {
    return this.page.getByRole('row', { name: rowStartingWith(name) });
  }

  /** Any text on the page that contains `part`, for a check that something appears nowhere. */
  text(part: string | RegExp): Locator {
    return this.page.getByText(part, { exact: false });
  }

  empty(): Locator {
    return this.page.getByText('You have not placed any orders yet.', { exact: true });
  }

  track(): Locator {
    return this.page.getByRole('button', { name: 'Track Your Order' });
  }
}

/** The tracking page (`/#/track-result/new?id=<ORDER_ID>`). */
export class TrackResultPage {
  constructor(private readonly page: Page) {}

  async open(orderId: string): Promise<void> {
    await this.page.goto(`#/track-result/new?id=${encodeURIComponent(orderId)}`);
  }

  /** Resolves with the status of the tracking's answer. Start it before the navigation. */
  async answered(): Promise<number> {
    const response = await this.page.waitForResponse((r) =>
      new URL(r.url()).pathname.startsWith('/rest/track-order/'),
    );
    return response.status();
  }

  heading(orderId: string): Locator {
    return this.page.getByRole('heading', { name: `Search Results - ${orderId}` });
  }

  expectedDelivery(): Locator {
    return this.page.getByRole('heading', { name: 'Expected Delivery' });
  }

  /** The value under "Expected Delivery": the days of the order's delivery method ("1 Days"). */
  expectedDeliveryDays(): Locator {
    return this.page.getByText(/^\d+ Days?$/);
  }

  product(name: string): Locator {
    return this.page.getByRole('row', { name: rowStartingWith(name) });
  }
}
