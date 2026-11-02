import { blockThirdParties, delay, failWith, mockJson, offline } from '../network';
import { expect, test, THIRD_PARTY_HOST } from './fake-app';

test('the third-party script is blocked and listed; the application still loads', async ({
  page,
  fakeApp,
}) => {
  const blocked = await blockThirdParties(page, [THIRD_PARTY_HOST]);
  await page.goto(`${fakeApp.url}/products`);
  await expect(page.getByRole('listitem')).toHaveCount(2);
  expect(blocked).toEqual([`http://${THIRD_PARTY_HOST}/tag.js`]);
  expect(await blockThirdParties(page, [])).toEqual([]);
});

test('an empty list and a server error come from mocks', async ({ page, fakeApp }) => {
  await mockJson(page, '**/api/products', []);
  await page.goto(`${fakeApp.url}/products`);
  await expect(page.getByText('No products')).toBeVisible();

  await page.unrouteAll();
  await failWith(page, '**/api/products', 503);
  await page.reload();
  await expect(page.getByText('Could not load products')).toBeVisible();
  await expect(failWith(page, '**/x', 302)).rejects.toThrow(/needs an error status/);
});

test('a delayed answer shows the loading indicator, which then goes away', async ({
  page,
  fakeApp,
}) => {
  await delay(page, '**/api/products', 800);
  // The indicator is in the page's HTML and shows only while the answer is held: waiting for the
  // load event would spend part of those 800 ms, and a busy machine all of them.
  await page.goto(`${fakeApp.url}/products`, { waitUntil: 'commit' });
  await expect(page.getByRole('status')).toHaveText('Loading products');
  await expect(page.getByRole('status')).toBeHidden();
  await expect(page.getByRole('listitem')).toHaveCount(2);
});

test('offline: the list cannot load, and back online it can', async ({
  page,
  context,
  fakeApp,
}) => {
  await page.goto(`${fakeApp.url}/products`);
  await offline(context);
  await page
    .evaluate(() => fetch('/api/products').catch(() => 'offline'))
    .then((result) => expect(result).toBe('offline'));
  await offline(context, false);
  await page.reload();
  await expect(page.getByRole('listitem')).toHaveCount(2);
});
