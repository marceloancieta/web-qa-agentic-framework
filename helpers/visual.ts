// Settings for visual comparisons. Screenshots are only stable in one rendering environment, so
// `@visual` cases run in the visual lane inside the pinned Playwright image and every other run
// leaves them out (scripts/lib/tags.mjs). What still changes between two renders on the same
// machine is removed here: animations, the caret, regions a page object declares dynamic, and the
// pack's own stylesheet of volatile parts.

import { join } from 'node:path';
import type { Locator, Page, PageAssertionsToHaveScreenshotOptions } from '@playwright/test';
import type { AppPack } from './app-pack';

export const DEFAULT_MAX_DIFF_PIXEL_RATIO = 0.01;

/** The `toHaveScreenshot` options for a pack, with the regions to mask for this comparison. */
export function screenshotOptions(
  app: Pick<AppPack, 'dir' | 'visual'>,
  mask: Locator[] = [],
): PageAssertionsToHaveScreenshotOptions {
  return {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    mask,
    maxDiffPixelRatio: app.visual?.maxDiffPixelRatio ?? DEFAULT_MAX_DIFF_PIXEL_RATIO,
    ...(app.visual?.stylePath ? { stylePath: join(app.dir, app.visual.stylePath) } : {}),
  };
}

/** The most any scrolling box of the page, the document included, hides below its visible part. */
async function hiddenHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    let hidden = doc.scrollHeight - doc.clientHeight;
    for (const element of Array.from(document.querySelectorAll('*'))) {
      if (!['auto', 'scroll'].includes(getComputedStyle(element).overflowY)) continue;
      hidden = Math.max(hidden, element.scrollHeight - element.clientHeight);
    }
    return Math.max(0, hidden);
  });
}

/**
 * Grows the viewport, at the same width, until no scrolling box hides content, so one screenshot
 * holds the whole page. Playwright's `fullPage` only follows the document, and applications built
 * on a layout container (an Angular Material sidenav, for one) scroll an inner box instead. The
 * width stays, so the breakpoint does not change. Resolves to a function that restores the size.
 */
export async function fitViewportToContent(
  page: Page,
  maxHeight = 16_000,
): Promise<() => Promise<void>> {
  const original = page.viewportSize();
  if (!original) throw new Error('fitViewportToContent needs a page with a fixed viewport.');
  let height = original.height;
  // Growing a box can reflow what it holds, so measure again until nothing is hidden.
  for (let round = 0; round < 5; round += 1) {
    const hidden = await hiddenHeight(page);
    if (hidden === 0) break;
    height = Math.min(maxHeight, height + hidden);
    await page.setViewportSize({ width: original.width, height });
    if (height === maxHeight) break;
  }
  return () => page.setViewportSize(original);
}
