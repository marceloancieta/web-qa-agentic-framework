// Visual: the empty registration form on every device project, compared with baselines rendered in
// the pinned image (npm run lanes:visual). Every other run leaves this file's cases out.

import { expect, test } from '../../fixtures';
import { RegisterPage } from '../../pages/register-page';

test('TC-SIGNUP-18 the empty registration form looks as designed @regression @visual @layout', async ({
  page,
  visual,
}) => {
  const register = new RegisterPage(page);
  await register.open();
  // A translated text: the page reads its texts after it loads.
  await expect(register.heading()).toBeVisible();
  await visual.expectToMatch(page, 'signup.png', [], { wholePage: true });
});
