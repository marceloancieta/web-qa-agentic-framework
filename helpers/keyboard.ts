// Keyboard access: the order Tab moves through, whether focus is visible, and whether focus can get
// stuck. Names are read the way assistive technology starts (aria-label, aria-labelledby, the
// label of a field, the visible text, title, placeholder); they identify elements in reports and
// are not a full accessible-name computation.

import type { Locator, Page } from '@playwright/test';

export interface FocusStop {
  /** The element's role or tag, such as `button` or `a`. */
  role: string;
  name: string;
}

const BODY: FocusStop = { role: 'body', name: '' };

/** The element that has focus now. */
export async function focused(page: Page): Promise<FocusStop> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) return { role: 'body', name: '' };
    const byIds = (element.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    const label = (element as HTMLInputElement).labels?.[0]?.textContent ?? '';
    const name =
      element.getAttribute('aria-label') ||
      byIds.trim() ||
      label.trim() ||
      element.textContent?.trim() ||
      element.getAttribute('title') ||
      element.getAttribute('placeholder') ||
      '';
    return {
      role: element.getAttribute('role') ?? element.tagName.toLowerCase(),
      name: name.replace(/\s+/g, ' '),
    };
  });
}

/**
 * The focus stops of `count` presses of Tab from where focus is now. Start from the top of the
 * page by focusing nothing first (a fresh navigation does that).
 */
export async function tabOrder(page: Page, count: number): Promise<FocusStop[]> {
  const stops: FocusStop[] = [];
  for (let i = 0; i < count; i += 1) {
    await page.keyboard.press('Tab');
    stops.push(await focused(page));
  }
  return stops;
}

/**
 * A focus trap: Tab cycles through a set of elements without ever leaving it for the rest of the
 * page or the browser. Returns the cycle when Tab returns to an element it already visited without
 * passing through the document body, or null. A modal dialog is meant to trap focus; check it with
 * the dialog open only when the trap is the defect.
 */
export async function findFocusTrap(page: Page, maxSteps = 50): Promise<FocusStop[] | null> {
  const key = (stop: FocusStop) => `${stop.role}|${stop.name}`;
  const visited: FocusStop[] = [];
  for (let i = 0; i < maxSteps; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await focused(page);
    if (key(stop) === key(BODY)) return null;
    const seenAt = visited.findIndex((earlier) => key(earlier) === key(stop));
    if (seenAt >= 0) return visited.slice(seenAt);
    visited.push(stop);
  }
  return null;
}

/**
 * Whether focusing the element changes how it is drawn (outline, box shadow, border or
 * background). A focus indicator that equals the resting style is invisible to keyboard users.
 */
export async function hasVisibleFocus(locator: Locator): Promise<boolean> {
  const style = () =>
    locator.evaluate((element) => {
      const computed = getComputedStyle(element);
      return [
        computed.outlineStyle,
        computed.outlineWidth,
        computed.outlineColor,
        computed.boxShadow,
        computed.borderColor,
        computed.backgroundColor,
      ].join('|');
    });
  await locator.evaluate((element) => (element as HTMLElement).blur());
  const resting = await style();
  await locator.focus();
  const withFocus = await style();
  return resting !== withFocus;
}
