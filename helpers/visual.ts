// Settings for visual comparisons. Screenshots are only stable in one rendering environment, so
// `@visual` cases run in the visual lane inside the pinned Playwright image and every other run
// leaves them out (scripts/lib/tags.mjs). What still changes between two renders on the same
// machine is removed here: animations, the caret, regions a page object declares dynamic, and the
// pack's own stylesheet of volatile parts.

import { join } from 'node:path';
import type { Locator, Page, PageAssertionsToHaveScreenshotOptions } from '@playwright/test';
import type { AppPack } from './app-pack';

export const DEFAULT_MAX_DIFF_PIXEL_RATIO = 0.01;

/** How long a whole-page comparison may take: tall pages on WebKit outlast the 5 s default. */
export const WHOLE_PAGE_SCREENSHOT_TIMEOUT_MS = 20_000;

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

/** How long the images in view may take to finish loading before a screenshot. */
export const IMAGES_LOADED_TIMEOUT_MS = 10_000;

/**
 * Waits until every image in the viewport has finished loading, loaded or broken, so a screenshot
 * never catches a product picture still on its way: `toHaveScreenshot` waits for two equal shots,
 * and two shots taken before a slow image arrives are equal. Images outside the viewport are left
 * alone, since a lazy one would never load there. Throws naming the images still loading.
 */
export async function imagesLoaded(page: Page, timeout = IMAGES_LOADED_TIMEOUT_MS): Promise<void> {
  // One function for the wait and for the report, run in the page as the expression's source.
  const stillLoading = `(${imagesStillLoading.toString()})()`;
  try {
    await page.waitForFunction(`${stillLoading}.length === 0`, undefined, { timeout });
  } catch {
    const srcs = await page.evaluate<string[]>(stillLoading).catch(() => [] as string[]);
    throw new Error(
      `Images still loading after ${timeout} ms, so the screenshot would not show them: ${srcs.join(', ')}`,
    );
  }
}

/** Runs in the page: the sources of the images in the viewport that have not finished loading. */
function imagesStillLoading(): string[] {
  return Array.from(document.images)
    .filter((image) => {
      const box = image.getBoundingClientRect();
      const inView =
        box.width > 0 &&
        box.height > 0 &&
        box.bottom > 0 &&
        box.right > 0 &&
        box.top < window.innerHeight &&
        box.left < window.innerWidth;
      return inView && !image.complete;
    })
    .map((image) => image.currentSrc || image.src);
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
