// The product list a signed-in user lands on. A visitor without a session who opens it is sent
// back to the login page.

import type { Locator, Page } from '@playwright/test';

export class InventoryPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('inventory.html');
  }

  /** The list of products, rendered only for a signed-in user. */
  list(): Locator {
    // The list is a plain container without a role or an accessible name; the pack's test id is
    // the next locator in the order (ADR 0007).
    return this.page.getByTestId('inventory-list');
  }
}
