import { browserStorage, seedSessionStorage, storedText } from '../storage';
import { expect, test } from './fake-app';

test('what a page keeps in local storage, session storage and cookies is read back', async ({
  page,
  context,
  fakeApp,
}) => {
  await context.addCookies([{ name: 'banner', value: 'dismissed', url: fakeApp.url }]);
  await page.goto(`${fakeApp.url}/`);
  await page.evaluate(() => {
    localStorage.setItem('token', 'local-value');
    sessionStorage.setItem('bid', 'session-value');
  });

  expect(await browserStorage(page)).toEqual({
    localStorage: { token: 'local-value' },
    sessionStorage: { bid: 'session-value' },
    cookies: { banner: 'dismissed' },
  });
  const text = await storedText(page);
  for (const value of ['local-value', 'session-value', 'dismissed']) expect(text).toContain(value);
  expect(text).not.toContain('token');
});

test('a page starts with the session storage a case seeds, on its origin only', async ({
  page,
  fakeApp,
}) => {
  await seedSessionStorage(page, new URL(fakeApp.url).origin, { bid: '42' });
  await page.goto(`${fakeApp.url}/`);
  expect((await browserStorage(page)).sessionStorage).toEqual({ bid: '42' });
  // The same server under another host name is another origin, which the seed leaves alone.
  const other = new URL(fakeApp.url);
  other.hostname = other.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
  await page.goto(`${other.origin}/`);
  expect((await browserStorage(page)).sessionStorage).toEqual({});
});
