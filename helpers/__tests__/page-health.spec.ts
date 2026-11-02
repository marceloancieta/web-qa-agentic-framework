import { cancelledByPage, checkOptions, healthReport, watchPageHealth } from '../page-health';
import { expect, test } from './fake-app';

test("a request the page cancels is not a failure in any engine; a mock's abort still is", () => {
  for (const reason of [
    'net::ERR_ABORTED',
    'NS_BINDING_ABORTED',
    'Load request cancelled',
    'cancelled',
  ])
    expect(cancelledByPage(reason)).toBe(true);
  for (const reason of ['net::ERR_FAILED', 'net::ERR_INTERNET_DISCONNECTED', 'failed', undefined])
    expect(cancelledByPage(reason)).toBe(false);
});

test('a healthy page has no problems, and a blocked-looking third party is not counted', async ({
  page,
  fakeApp,
}) => {
  const guard = watchPageHealth(page);
  await page.goto(`${fakeApp.url}/products`);
  await expect(page.getByRole('listitem')).toHaveCount(2);
  expect(await guard.problems()).toEqual([]);
});

test('every kind of problem is reported on a broken page', async ({ page, fakeApp }) => {
  const guard = watchPageHealth(page);
  await page.goto(`${fakeApp.url}/broken`);
  await expect
    .poll(async () => (await guard.problems()).map((p) => p.kind).sort())
    .toEqual(['broken-image', 'console-error', 'failed-request', 'uncaught-error']);
  const report = healthReport(await guard.problems());
  expect(report).toContain('The page health guard found 4 problem(s)');
  expect(report).toContain('failed-request: GET');
  expect(report).toContain('/api/fail: 500');
});

test('expected console errors and requests can be allowed', async ({ page, fakeApp }) => {
  const guard = watchPageHealth(page, {
    allowConsole: [/boom in/],
    allowRequests: ['/api/fail', '/missing.png'],
  });
  await page.goto(`${fakeApp.url}/broken`);
  await expect
    .poll(async () => (await guard.problems()).map((p) => p.kind))
    .toEqual(['uncaught-error']);
});

test('a logged error object is described by its fields, even when the page reloads right after', async ({
  page,
}) => {
  const guard = watchPageHealth(page);
  // An Angular-style error log: "ERROR" and an HttpErrorResponse whose class name is minified, then
  // a reload at once, as when a step leaves the page while a request is in flight. A plain string
  // and an object without error fields are logged unchanged.
  let loads = 0;
  await page.route('http://health.test/**', (route) => {
    loads += 1;
    const script =
      loads === 1
        ? `class Dr extends Error {}
           const error = Object.assign(new Dr('Http failure response for /api/cards: 0 Unknown Error'),
             { name: 'HttpErrorResponse', status: 0, statusText: 'Unknown Error', url: '/api/cards' });
           console.error('ERROR', error);
           console.error('plain words');
           console.error('ERROR', { retries: 2 });
           location.reload();`
        : '';
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="en"><title>t</title><main><h1>Pay</h1></main><script>${script}</script></html>`,
    });
  });
  await page.goto('http://health.test/payment');
  await expect.poll(() => loads).toBe(2);
  const details = (await guard.problems()).map((p) => p.detail);
  expect(details).toEqual([
    expect.stringMatching(
      /^ERROR .*\[HttpErrorResponse \{message: Http failure response for \/api\/cards: 0 Unknown Error, status: 0, statusText: Unknown Error, url: \/api\/cards\}\]$/s,
    ),
    'plain words',
    expect.not.stringContaining('['),
  ]);
});

test('switching the guard off needs a reason', () => {
  expect(() => checkOptions({ off: '  ' })).toThrow(/needs a reason/);
  expect(() => checkOptions({ off: 'the widget logs errors upstream' })).not.toThrow();
  expect(healthReport([])).toBeNull();
});
