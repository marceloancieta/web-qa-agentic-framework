import type { Page } from '@playwright/test';

// mocks/ owns the network handlers that specs call by name.
export async function emptyCatalog(page: Page): Promise<void> {
  await page.route('**/rest/products/search*', (route) => route.fulfill({ json: { data: [] } }));
}
