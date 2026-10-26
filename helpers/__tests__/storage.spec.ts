import { browserStorage, storedText } from '../storage';
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
