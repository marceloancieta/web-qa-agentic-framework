// Layout checks that need no baseline: content wider than the viewport, and text that does not fit
// the box it is in. Long and boundary texts come from the pack's builders, injected through the
// API or a mock; these checks say whether the page survived them.

import type { Locator, Page } from '@playwright/test';

/**
 * How many CSS pixels of content the widest scroller of the page cannot show; 0 when nothing
 * scrolls sideways. The scrollers are the document and every element that scrolls by itself, since
 * an application shell often scrolls inside a container and leaves the document as wide as the
 * viewport.
 */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scrolls = (element: Element) =>
      ['auto', 'scroll'].includes(getComputedStyle(element).overflowX);
    const inner = [...document.querySelectorAll('body, body *')].filter(scrolls);
    const scrollers = [document.documentElement, ...inner];
    return Math.max(0, ...scrollers.map((e) => e.scrollWidth - e.clientWidth));
  });
}

/**
 * `horizontalOverflow` read once for a value kept for later, when a retrying assertion cannot wait
 * for it: 0 as soon as a read gives 0, otherwise the last read of `ms`. A shell can measure a few
 * pixels wider for a moment while a page settles, and a lasting overflow stays through the window.
 */
export async function settledHorizontalOverflow(page: Page, ms = 1_000): Promise<number> {
  const deadline = Date.now() + ms;
  let overflow = await horizontalOverflow(page);
  while (overflow > 0 && Date.now() < deadline) overflow = await horizontalOverflow(page);
  return overflow;
}

/**
 * Wait until the page's running animations end, the endless ones aside. Reading a state while it
 * fades in measures a colour the page never rests on: a hint at 30% opacity fails a contrast check.
 */
export async function animationsFinished(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const ending = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
    await Promise.allSettled(ending.map((animation) => animation.finished));
  });
}

export interface ClippedText {
  text: string;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * Elements under `scope` whose content is larger than their box and is cut off rather than
 * scrolled or wrapped. An ellipsis (`text-overflow: ellipsis`) counts as handled and is not listed.
 */
export async function clippedText(scope: Locator): Promise<ClippedText[]> {
  return scope.evaluate((root) => {
    const found: ClippedText[] = [];
    for (const element of [root, ...Array.from(root.querySelectorAll('*'))] as HTMLElement[]) {
      const style = getComputedStyle(element);
      const wider = element.scrollWidth > element.clientWidth + 1;
      const taller = element.scrollHeight > element.clientHeight + 1;
      if (!wider && !taller) continue;
      const scrolls = [style.overflowX, style.overflowY].some(
        (value) => value === 'auto' || value === 'scroll',
      );
      const clips = [style.overflowX, style.overflowY].some(
        (value) => value === 'hidden' || value === 'clip',
      );
      if (scrolls || !clips || (wider && style.textOverflow === 'ellipsis')) continue;
      found.push({
        text: (element.textContent ?? '').trim().slice(0, 80),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      });
    }
    return found;
  });
}

/** The source of each image of `images` that has not loaded; empty once all of them have. */
export async function unloadedImages(images: Locator): Promise<string[]> {
  return images.evaluateAll((elements) =>
    (elements as HTMLImageElement[])
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src),
  );
}

/**
 * How many CSS pixels the text of `scope` runs past the box of `container`, and past the viewport;
 * 0 or less while it stays inside. It measures the rendered text, not the element around it: a long
 * unbroken word leaves its element the size the layout gave it and runs out of it, and a clipping
 * ancestor hides that from `horizontalOverflow`. Text its block shortens with an ellipsis
 * (`text-overflow: ellipsis` with the overflow clipped) is measured to that block's content edge,
 * as `clippedText` counts it handled; a plain clip still counts as spill.
 */
export async function textSpill(
  scope: Locator,
  container: Locator = scope,
): Promise<{ box: number; viewport: number }> {
  const limit = await container.evaluate((element) => element.getBoundingClientRect().right);
  const right = await scope.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const laidOut = range.getBoundingClientRect().right;
    // text-overflow belongs to the block container whose inline content overflows. Only a plain
    // inline box is walked past: an inline-block, inline-flex or inline-grid is its own container.
    let block: Element | null = element;
    while (block && getComputedStyle(block).display === 'inline') {
      block = block.parentElement;
    }
    if (!block) return laidOut;
    const style = getComputedStyle(block);
    const shortened =
      style.textOverflow === 'ellipsis' && ['hidden', 'clip'].includes(style.overflowX);
    if (!shortened) return laidOut;
    const edge =
      block.getBoundingClientRect().right -
      parseFloat(style.borderRightWidth) -
      parseFloat(style.paddingRight);
    return Math.min(laidOut, edge);
  });
  const width = await scope.evaluate(() => document.documentElement.clientWidth);
  return { box: right - limit, viewport: right - width };
}
