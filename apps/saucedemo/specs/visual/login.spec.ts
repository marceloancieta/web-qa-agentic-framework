// Visual: the login page on every device project, compared with baselines rendered in the pinned
// image (npm run lanes:visual). Every other run leaves this file's cases out.

import { expect, test } from '../../fixtures';
import { LoginPage } from '../../pages/login-page';

test('TC-LOGIN-14 the login page looks as designed @regression @visual @layout', async ({
  page,
  visual,
}) => {
  const login = new LoginPage(page);
  await login.open();
  await expect(login.loginButton()).toBeVisible();
  await visual.expectToMatch(page, 'login.png', [], { wholePage: true });
});
