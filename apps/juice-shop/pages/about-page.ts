// The about page (`/#/about`), a page every visitor reaches with the shop's toolbar on it.

import type { Locator, Page } from '@playwright/test';

export class AboutPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('#/about');
  }

  title(): Locator {
    return this.page.getByRole('heading', { name: 'About Us', level: 1 });
  }
}
