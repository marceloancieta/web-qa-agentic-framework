// Visual: the login page on every device project, compared with baselines rendered in the pinned
// image (npm run lanes:visual). Every other run leaves this file's cases out.

import { LoginPage } from '../../pages/login-page';
import { expect, test } from '../../fixtures';

test('the login page looks as designed @regression @visual', async ({ page, visual }) => {
  const login = new LoginPage(page);
  await login.open();
  await expect(login.submit()).toBeVisible();
  await visual.expectToMatch(page, 'login.png');
});
