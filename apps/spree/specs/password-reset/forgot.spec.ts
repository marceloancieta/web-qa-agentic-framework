// The request for a password reset on the Spree dashboard (registry/password-reset.md). The page
// starts signed out. A case that asks for a member's reset makes a `staff` member of its own
// (`actor('staff', { fresh: true })`), removed when the worker ends, and reads the member's mail from
// the mail catcher (`mail`, ADR 0014); the member has also been sent the invitation, so reset
// emails are picked by subject.

import { hasVisibleFocus } from '../../../../helpers/keyboard';
import { anUnknownEmail } from '../../builders/staff-builder';
import { ABORTED_FONT_DOWNLOAD, expect, test, type Actor } from '../../fixtures';
import { RESET_LINK, RESET_SUBJECT, resetEmailsTo } from '../../flows/password-reset';
import { watchPasswordResets } from '../../mocks/auth-mocks';
import { ForgotPasswordPage } from '../../pages/forgot-password-page';
import { LoginPage } from '../../pages/login-page';

const EMAIL_MESSAGE = 'Invalid email address';
const ON_FORGOT = /\/dashboard\/forgot-password$/;
const ON_LOGIN = /\/dashboard\/login$/;
// The reset request answers at once; the email follows from a job (docs/app-notes.md, Mail).
const ANSWER = { timeout: 15_000 };

test.use({ pageHealth: { allowConsole: [ABORTED_FONT_DOWNLOAD] } });

type ActorOf = (role: string, options: { fresh: true }) => Promise<Actor>;

/** The address of a staff member of the case's own, created through the admin API. */
async function ownStaffEmail(actor: ActorOf, qa: { allowWrites: boolean }): Promise<string> {
  test.skip(!qa.allowWrites, 'the case creates a staff member; allow_writes is false');
  const { account, context } = await actor('staff', { fresh: true });
  if (!account) throw new Error('A staff actor has an account.');
  // The member's own session is not needed: someone who forgot the password has none.
  await context.close();
  return account.username;
}

test('TC-PWRESET-01 /dashboard/forgot-password shows the heading "Reset your password", Email with the focus and "Send reset link", and "Back to sign in" leads to /dashboard/login @sanity @navigation', async ({
  page,
}) => {
  const forgot = new ForgotPasswordPage(page);
  await forgot.open();

  await expect(forgot.heading()).toBeVisible();
  await expect(forgot.email()).toBeFocused();
  await expect(forgot.send()).toBeVisible();
  await expect(forgot.send()).toBeEnabled();

  await forgot.backToSignIn().click();

  await expect(page).toHaveURL(ON_LOGIN);
  await expect(new LoginPage(page).heading()).toBeVisible();
});

test('TC-PWRESET-02 "Send reset link" with Email empty shows "Invalid email address" under it, marks it invalid and sends no reset request @regression', async ({
  page,
}) => {
  const forgot = new ForgotPasswordPage(page);
  const resets = watchPasswordResets(page);
  await forgot.open();
  await expect(forgot.email()).not.toHaveAttribute('aria-invalid', 'true');

  await forgot.send().click();

  await expect(forgot.message(EMAIL_MESSAGE)).toBeVisible();
  await expect(forgot.email()).toHaveAttribute('aria-invalid', 'true');
  await expect(forgot.confirmation()).toHaveCount(0);
  await expect(page).toHaveURL(ON_FORGOT);
  expect(resets.requested()).toBe(0);
});

test('TC-PWRESET-03 "Send reset link" for <STAFF_EMAIL> replaces the form with "Check your email", the sentence and "Back to sign in", and one "Password Reset Instructions" email reaches <STAFF_EMAIL> with a "Reset Password" link @smoke', async ({
  page,
  actor,
  qa,
  mail,
}) => {
  const email = await ownStaffEmail(actor, qa);
  expect(await resetEmailsTo(mail, email), 'no reset email before the request').toEqual([]);
  const forgot = new ForgotPasswordPage(page);
  const resets = watchPasswordResets(page);
  await forgot.open();

  await forgot.request(email);

  await expect(forgot.confirmation()).toBeVisible(ANSWER);
  await expect(forgot.confirmationText()).toBeVisible();
  await expect(forgot.backToSignIn()).toBeVisible();
  await expect(forgot.email()).toHaveCount(0);
  // The page asked once: the request goes out before the confirmation shows.
  expect(resets.requested(), 'reset requests sent').toBe(1);
  const message = await mail.waitForMessage(email, { subject: RESET_SUBJECT });
  expect(message.to).toEqual([email]);
  expect(message.links.filter((link) => RESET_LINK.test(link))).toHaveLength(1);
  expect(message.text).toContain('Reset Password');
  // Read when the first email has arrived; one request was sent, so one email is expected.
  expect(await resetEmailsTo(mail, email), 'one reset email').toHaveLength(1);
});

test('TC-PWRESET-04 "Send reset link" for <UNKNOWN_EMAIL> shows the same confirmation as for <STAFF_EMAIL>, and once the staff member\'s email has arrived, none has reached <UNKNOWN_EMAIL> @regression @security', async ({
  page,
  actor,
  qa,
  mail,
}) => {
  const email = await ownStaffEmail(actor, qa);
  const unknown = anUnknownEmail(test.info().workerIndex);
  const forgot = new ForgotPasswordPage(page);

  // The same confirmation for both: its title, its sentence and the link back, the form gone.
  for (const [label, address] of [
    ['an unknown email', unknown],
    ["the member's email", email],
  ] as const) {
    await test.step(`${label} gets the confirmation`, async () => {
      await forgot.open();
      await forgot.request(address);
      await expect(forgot.confirmation()).toBeVisible(ANSWER);
      await expect(forgot.confirmationText()).toBeVisible();
      await expect(forgot.backToSignIn()).toBeVisible();
      await expect(forgot.email()).toHaveCount(0);
      await expect(page).toHaveURL(ON_FORGOT);
    });
  }

  // The unknown address was asked for first; once the member's email, asked for second, has come,
  // a mail for the unknown address would have come too.
  await mail.waitForMessage(email, { subject: RESET_SUBJECT });
  expect(await mail.messagesTo(unknown), 'mail sent to the unknown address').toEqual([]);
});

test('TC-PWRESET-15 on the forgot page Email has the focus, Tab reaches "Send reset link" and "Back to sign in" in that order with a visible focus, and Enter in Email sends the request @regression @a11y @not-webkit', async ({
  page,
}) => {
  const forgot = new ForgotPasswordPage(page);
  await forgot.open();
  await expect(forgot.email()).toBeFocused();
  await page.keyboard.type(anUnknownEmail(test.info().workerIndex));
  expect(await hasVisibleFocus(forgot.email()), 'focus visible on Email').toBe(true);

  const order = [
    ['Send reset link', forgot.send()],
    ['Back to sign in', forgot.backToSignIn()],
  ] as const;
  for (const [name, control] of order) {
    await test.step(`Tab to ${name}`, async () => {
      await page.keyboard.press('Tab');
      await expect(control).toBeFocused();
      expect(await hasVisibleFocus(control), `focus visible on ${name}`).toBe(true);
    });
  }

  await test.step('Enter in Email sends the request', async () => {
    const resets = watchPasswordResets(page);
    await forgot.email().focus();
    await page.keyboard.press('Enter');
    await expect(forgot.confirmation()).toBeVisible(ANSWER);
    expect(resets.requested()).toBe(1);
  });
});
