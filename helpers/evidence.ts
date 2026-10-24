// Evidence attached to the running test through Playwright's test info, so every reporter (HTML,
// Allure, a test-management adapter) receives it without a reporter-specific call. Everything is
// redacted on the way in; screenshots mask the fields that show what was typed.

import type { Locator, Page, TestInfo } from '@playwright/test';
import { redact, redactText, type RedactionPolicy } from './redact';

/** Attach a value as JSON, redacted. */
export async function attachJson(
  testInfo: TestInfo,
  name: string,
  value: unknown,
  policy: RedactionPolicy = {},
): Promise<void> {
  await testInfo.attach(name, {
    body: JSON.stringify(redact(value, policy), null, 2),
    contentType: 'application/json',
  });
}

/** Attach free text, scrubbed of the known secrets. */
export async function attachText(
  testInfo: TestInfo,
  name: string,
  text: string,
  policy: RedactionPolicy = {},
): Promise<void> {
  await testInfo.attach(name, { body: redactText(text, policy), contentType: 'text/plain' });
}

/**
 * The fields a screenshot must cover: password inputs, one-time codes, card data, and anything a
 * page object marks with `data-qa-sensitive`. Pass them as `mask` to `screenshot` or
 * `toHaveScreenshot`.
 */
export function sensitiveFields(page: Page): Locator[] {
  return [
    page.locator('input[type="password"]'),
    page.locator('[autocomplete="one-time-code"], [autocomplete^="cc-"]'),
    page.locator('[data-qa-sensitive]'),
  ];
}

/** Attach a screenshot of the page with the sensitive fields masked. */
export async function attachScreenshot(
  testInfo: TestInfo,
  page: Page,
  name: string,
  extraMask: Locator[] = [],
): Promise<void> {
  const body = await page.screenshot({ mask: [...sensitiveFields(page), ...extraMask] });
  await testInfo.attach(name, { body, contentType: 'image/png' });
}
