// Network building blocks for a pack's `mocks/`. Specs never route the network themselves
// (lint-layers, spec-routes-network); they call a pack handler such as `emptyBasket(page)`, which
// is written with these helpers. Their main use is the states the real system does not produce on
// demand: a server error, a slow answer, an empty list, no connection.

import type { BrowserContext, Page, Route } from '@playwright/test';

/** What a route pattern can be: a glob, a regular expression or a predicate on the URL. */
export type UrlMatch = string | RegExp | ((url: URL) => boolean);

/**
 * Abort every request to the given hosts (and their subdomains): analytics, ads and fonts make
 * runs slower and less stable, and are not what the case tests. Returns the URLs it blocked.
 */
export async function blockThirdParties(
  target: Page | BrowserContext,
  hosts: readonly string[],
): Promise<string[]> {
  const blocked: string[] = [];
  if (hosts.length === 0) return blocked;
  const lowered = hosts.map((host) => host.toLowerCase());
  const isThirdParty = (url: URL) =>
    lowered.some(
      (host) => url.host === host || url.hostname === host || url.hostname.endsWith(`.${host}`),
    );
  await target.route(isThirdParty, async (route) => {
    blocked.push(route.request().url());
    await route.abort('blockedbyclient');
  });
  return blocked;
}

/** Answer matching requests with a JSON body (status 200 unless given). */
export async function mockJson(
  page: Page,
  url: UrlMatch,
  body: unknown,
  { status = 200, headers = {} }: { status?: number; headers?: Record<string, string> } = {},
): Promise<void> {
  await page.route(url, (route) => route.fulfill({ status, json: body, headers }));
}

/** Answer matching requests with an error status and an optional body. */
export async function failWith(
  page: Page,
  url: UrlMatch,
  status: number,
  body: unknown = { error: `status ${status}` },
): Promise<void> {
  if (status < 400) throw new Error(`failWith needs an error status (400 or more), got ${status}.`);
  await page.route(url, (route) => route.fulfill({ status, json: body }));
}

/**
 * Hold matching requests for `ms` before they continue to the real server, so a case can see the
 * loading state appear and then go away.
 */
export async function delay(page: Page, url: UrlMatch, ms: number): Promise<void> {
  await page.route(url, async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.fallback();
  });
}

/** Take the browser context offline (true) or back online (false). */
export async function offline(context: BrowserContext, value = true): Promise<void> {
  await context.setOffline(value);
}

/**
 * Serve matching requests from a recorded HAR file. Record with `update: true` only in the automate
 * phase, then redact the file (`redactHarFile`) before it is committed; the secret scan checks it.
 */
export async function fromHar(
  page: Page,
  harPath: string,
  { url, update = false }: { url?: string | RegExp; update?: boolean } = {},
): Promise<void> {
  await page.routeFromHAR(harPath, { url, update, notFound: 'abort' });
}
