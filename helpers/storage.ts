// What a page keeps in the browser: local storage, session storage and the cookies of its context.
// A case about secrets in storage asserts on what this returns, never reads storage itself.

import type { Page } from '@playwright/test';

export interface BrowserStorage {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  cookies: Record<string, string>;
}

export async function browserStorage(page: Page): Promise<BrowserStorage> {
  const stores = await page.evaluate(() => {
    const read = (store: Storage) =>
      Object.fromEntries(
        Array.from({ length: store.length }, (_, i) => store.key(i) as string).map((key) => [
          key,
          store.getItem(key) ?? '',
        ]),
      );
    return { localStorage: read(localStorage), sessionStorage: read(sessionStorage) };
  });
  const cookies = Object.fromEntries(
    (await page.context().cookies()).map((cookie) => [cookie.name, cookie.value]),
  );
  return { ...stores, cookies };
}

/**
 * Put `items` into the session storage of every page the context opens on `origin`, before the
 * page's own scripts run: a case that needs the page to start from a given session state.
 */
export async function seedSessionStorage(
  page: Page,
  origin: string,
  items: Record<string, string>,
): Promise<void> {
  await page.context().addInitScript(
    ({ target, entries }) => {
      if (location.origin !== target) return;
      for (const [name, value] of entries) sessionStorage.setItem(name, value);
    },
    { target: origin, entries: Object.entries(items) },
  );
}

/** Every value the page keeps, joined, for a check that a text appears nowhere in storage. */
export async function storedText(page: Page): Promise<string> {
  const { localStorage, sessionStorage, cookies } = await browserStorage(page);
  return [localStorage, sessionStorage, cookies]
    .flatMap((store) => Object.values(store))
    .join('\n');
}
