// The page the application opens on.

import type { Locator, Page } from '@playwright/test';

export class HomePage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('');
  }

  /** The first top-level heading, if the page has one. */
  heading(): Locator {
    return this.page.getByRole('heading', { level: 1 }).first();
  }
}
