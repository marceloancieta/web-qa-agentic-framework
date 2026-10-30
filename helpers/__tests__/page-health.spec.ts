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

test('switching the guard off needs a reason', () => {
  expect(() => checkOptions({ off: '  ' })).toThrow(/needs a reason/);
  expect(() => checkOptions({ off: 'the widget logs errors upstream' })).not.toThrow();
  expect(healthReport([])).toBeNull();
});
