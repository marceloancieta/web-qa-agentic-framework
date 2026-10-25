import type { Page } from '@playwright/test';

// mocks/ may hold an answer back on purpose and may route by CSS-free URL patterns.
export async function slowCatalog(page: Page): Promise<void> {
  await page.route('**/api/products', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fallback();
  });
}

export function firstFrame(page: Page) {
  return page.frameLocator('(//iframe)[1]'); // expect-finding: xpath-locator
}
