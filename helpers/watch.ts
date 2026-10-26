// Watching for something that must not appear. A retrying negative assertion (`toBeHidden`,
// `toHaveCount(0)`) passes as soon as the element is gone, so an element that shows and then closes
// by itself, such as a notification, slips past it. A watch starts before the action and reports
// whether the element became visible at any moment of a fixed window.

import type { Locator } from '@playwright/test';

/**
 * Resolves to true if `locator` becomes visible within `ms`, false otherwise. Start it before the
 * action that could make the element appear, await it after, and assert on the answer. Make `ms`
 * longer than the element would stay on screen.
 */
export async function becomesVisibleWithin(locator: Locator, ms: number): Promise<boolean> {
  try {
    await locator.first().waitFor({ state: 'visible', timeout: ms });
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') return false;
    throw error;
  }
}
