// The API contexts a run creates for actors and packs. Node keeps idle connections open and reuses
// them; a server that closes an idle one at the moment the next request goes out on it (Express does
// after 5 s) resets that request before reading it, and the case fails with "socket hang up
// (ECONNRESET)" on a working application. Such a request never reached the application, so it is
// sent again. Playwright retries only ECONNRESET this way; every other network error fails at once.
// A write is resent too: a reset after the server handled it would send it twice, which the
// application refuses loudly (a second registration of one email), never silently.

import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';

/** How many times a request whose connection the server reset is sent again. */
export const RESET_RETRIES = 2;

const REQUESTS = new Set(['fetch', 'get', 'post', 'put', 'patch', 'delete', 'head']);

/** `api` with every request retried on a reset connection, unless the caller sets `maxRetries`. */
export function retryingResets(api: APIRequestContext, times = RESET_RETRIES): APIRequestContext {
  return new Proxy(api, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown;
      if (typeof value !== 'function') return value;
      if (typeof property !== 'string' || !REQUESTS.has(property)) return value.bind(target);
      return (url: unknown, options: Record<string, unknown> = {}) =>
        value.call(target, url, { maxRetries: times, ...options });
    },
  });
}

/** A new API context, as `playwright.request.newContext`, that retries reset connections. */
export async function newApiContext(
  playwright: PlaywrightWorkerArgs['playwright'],
  options: Parameters<PlaywrightWorkerArgs['playwright']['request']['newContext']>[0],
): Promise<APIRequestContext> {
  return retryingResets(await playwright.request.newContext(options));
}
