import type { Locator, Page } from '@playwright/test';

export class CatalogPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/catalog');
    await this.page.waitForTimeout(500); // expect-finding: fixed-wait
  }

  heading(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  priceOf(product: string): Locator {
    return this.page.locator('//li[contains(., "x")]/span').filter({ hasText: product }); // expect-finding: xpath-locator
  }

  firstCard(): Locator {
    return this.page.locator('.cards > li:nth-child(1)'); // expect-finding: positional-selector
  }

  thirdRow(): Locator {
    return this.page.getByRole('row').nth(2); // expect-finding: positional-selector
  }

  // The newest item is always first: the list is sorted by date and has no other identity.
  newest(): Locator {
    return this.page.getByRole('listitem').nth(0);
  }

  banner(): Locator {
    return this.page.locator('app-banner'); // expect-finding: css-without-reason
  }

  // The rating widget is a canvas with no role, label or test id (reported upstream).
  rating(): Locator {
    return this.page.locator('canvas.rating');
  }

  empty(): Locator {
    return this.page.getByText('No products found'); // expect-finding: text-without-exact
  }

  emptyExact(): Locator {
    return this.page.getByText('No products found', { exact: true });
  }

  anyTotal(): Locator {
    return this.page.getByText(/Total: \d+/);
  }

  byVariable(label: string): Locator {
    return this.page.getByText(label);
  }
}
