import type { Locator, Page } from '@playwright/test';

export class Toast {
  constructor(private readonly page: Page) {}

  message(): Locator {
    return this.page.getByRole('status');
  }

  async dismiss(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 300)); // expect-finding: fixed-wait
    await this.page.getByRole('button', { name: 'Dismiss' }).click();
  }

  byXpath(): Locator {
    return this.page.locator('xpath=//div[@class="toast"]'); // expect-finding: xpath-locator
  }
}
