// Settings for visual comparisons. Screenshots are only stable in one rendering environment, so
// `@visual` cases run in the visual lane inside the pinned Playwright image and every other run
// leaves them out (scripts/lib/tags.mjs). What still changes between two renders on the same
// machine is removed here: animations, the caret, regions a page object declares dynamic, and the
// pack's own stylesheet of volatile parts.

import { join } from 'node:path';
import type { Locator, PageAssertionsToHaveScreenshotOptions } from '@playwright/test';
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
