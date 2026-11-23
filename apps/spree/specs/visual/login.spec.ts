// Visual: the sign-in page in its three states on every device project, compared with baselines
// rendered in the pinned image (npm run lanes:visual). Every other run leaves this file's cases out.
// The page shows no run data until something is typed; a refused sign-in masks the two fields.

import { generatedPassword } from '../../../../helpers/actors';
import { anUnknownEmail } from '../../builders/staff-builder';
import { ABORTED_FONT_DOWNLOAD, expect, test } from '../../fixtures';
import { LoginPage } from '../../pages/login-page';

// REQ-LOGIN-02 and 04: the messages each state shows.
const EMAIL_MESSAGE = 'Invalid email address';
const PASSWORD_MESSAGE = 'Password is required';
const REFUSAL = 'Invalid email or password';
// A sign-in answer took up to a few seconds on a local container busy with parallel workers.
const ANSWER = { timeout: 15_000 };

test.use({ pageHealth: { allowConsole: [ABORTED_FONT_DOWNLOAD] } });

test('TC-LOGIN-21 the login page looks as designed when it opens: the heading, Email, Password, "Sign in" and "Forgot password?", with Email focused @regression @visual @layout', async ({
  page,
  visual,
}) => {
  const login = new LoginPage(page);

  await login.open();

  await expect(login.email()).toBeFocused();
  await expect(login.forgotPassword()).toBeVisible();
  await visual.expectToMatch(page, 'login.png', [], { wholePage: true });
});

test('TC-LOGIN-22 after "Sign in" with both fields empty, the page looks as designed with "Invalid email address" under Email, "Password is required" under Password and both fields marked invalid @regression @visual @layout', async ({
  page,
  visual,
}) => {
  const login = new LoginPage(page);
  await login.open();

  await login.submit().click();

  await expect(login.message(EMAIL_MESSAGE)).toBeVisible();
  await expect(login.message(PASSWORD_MESSAGE)).toBeVisible();
  await expect(login.email()).toHaveAttribute('aria-invalid', 'true');
  await expect(login.password()).toHaveAttribute('aria-invalid', 'true');
  await visual.expectToMatch(page, 'login-invalid.png', [], { wholePage: true });
});

test('TC-LOGIN-23 after a sign-in refused for <UNKNOWN_EMAIL>, the page looks as designed with "Invalid email or password" and the fields keeping their layout @regression @visual @layout', async ({
  page,
  visual,
}) => {
  const login = new LoginPage(page);
  await login.open();

  await login.signIn(anUnknownEmail(test.info().workerIndex), generatedPassword());

  await expect(login.message(REFUSAL)).toBeVisible(ANSWER);
  // "Sign in" reads again once the answer is back, so the button is in its resting state.
  await expect(login.submit()).toBeEnabled(ANSWER);
  await visual.expectToMatch(page, 'login-refused.png', login.typedValues(), { wholePage: true });
});
