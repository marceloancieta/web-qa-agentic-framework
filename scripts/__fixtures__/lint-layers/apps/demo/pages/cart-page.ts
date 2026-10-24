import { expect, type Locator, type Page } from '@playwright/test'; // expect-finding: page-object-asserts

export class CartPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/basket');
  }

  row(product: string): Locator {
    return this.page.getByRole('row').filter({ hasText: product });
  }

  total(): Locator {
    return this.page.getByTestId('basket-total');
  }

  emptyMessage(): Locator {
    return this.page.getByText('Your basket is empty', { exact: true });
  }

  async checkout(): Promise<void> {
    await expect(this.page.getByRole('button', { name: 'Checkout' })).toBeEnabled(); // expect-finding: page-object-asserts
    await this.page.getByRole('button', { name: 'Checkout' }).click();
  }
}
