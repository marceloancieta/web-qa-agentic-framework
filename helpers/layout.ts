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
