// Keyboard access: the order Tab moves through, whether focus is visible, and whether focus can get
// stuck. Names are read the way assistive technology starts (aria-label, aria-labelledby, the
// label of a field, the visible text, the value of an input drawn as a button, title,
// placeholder); they identify elements in reports and
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
    // An input drawn as a button is named by its value, or by its alt text when it is an image; the
    // value of a field someone types into is never its name.
    const input = element instanceof HTMLInputElement ? element : null;
    const buttonValue =
      input && ['submit', 'button', 'reset'].includes(input.type) ? input.value.trim() : '';
    const imageAlt = input?.type === 'image' ? input.alt.trim() : '';
    const name =
      element.getAttribute('aria-label') ||
      byIds.trim() ||
      label.trim() ||
      element.textContent?.trim() ||
      buttonValue ||
      imageAlt ||
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
 * Press Tab until `target` has focus, at most `most` times, and return the stops passed on the
 * way, so a failure can say where Tab went instead. Assert on the target afterwards
 * (`toBeFocused`); this returns whether or not it got there.
 */
export async function tabUntil(page: Page, target: Locator, most: number): Promise<FocusStop[]> {
  const stops: FocusStop[] = [];
  const hasFocus = () => target.evaluate((element) => element === document.activeElement);
  for (let press = 0; press < most && !(await hasFocus()); press += 1) {
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

/**
 * Whether focusing `target` changes how `region` is drawn. A component library often draws the
 * focus indicator on a wrapper or a pseudo-element (an outline on the form field around an input,
 * a ripple behind a button), which `hasVisibleFocus` cannot read from the element's own style. The
 * region is a screenshot at rest and with focus; animations are disabled so the two only differ
 * by the focus.
 */
export async function focusChangesRendering(target: Locator, region: Locator): Promise<boolean> {
  await target.evaluate((element) => (element as HTMLElement).blur());
  const resting = await region.screenshot({ animations: 'disabled', caret: 'hide' });
  await target.focus();
  const withFocus = await region.screenshot({ animations: 'disabled', caret: 'hide' });
  return !resting.equals(withFocus);
}
