import { expect, test, type APIRequestContext } from '@playwright/test';
import { RESET_RETRIES, retryingResets } from '../api-context';

// A stand-in for an API context that records what each request was sent with.
function recorder() {
  const calls: [string, unknown, Record<string, unknown>][] = [];
  const request =
    (method: string) =>
    (url: unknown, options: Record<string, unknown> = {}) => {
      calls.push([method, url, options]);
      return Promise.resolve(method);
    };
  const fake = {
    get: request('get'),
    post: request('post'),
    fetch: request('fetch'),
    disposed: false,
    dispose() {
      this.disposed = true;
      return Promise.resolve();
    },
  };
  return { calls, fake, api: retryingResets(fake as unknown as APIRequestContext) };
}

test('every request retries a reset connection unless the caller says otherwise', async () => {
  const { calls, api } = recorder();
  await api.get('api/Users');
  await api.post('api/Users', { data: { email: 'x' } });
  await api.fetch('rest/basket/1', { maxRetries: 0 });
  expect(calls).toEqual([
    ['get', 'api/Users', { maxRetries: RESET_RETRIES }],
    ['post', 'api/Users', { maxRetries: RESET_RETRIES, data: { email: 'x' } }],
    ['fetch', 'rest/basket/1', { maxRetries: 0 }],
  ]);
});

test('the rest of the context works as before, on the context itself', async () => {
  const { fake, api } = recorder();
  await api.dispose();
  expect(fake.disposed).toBe(true);
});
