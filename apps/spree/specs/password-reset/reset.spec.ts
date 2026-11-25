// Choosing a new password from a reset link on the Spree dashboard (registry/password-reset.md).
// A case that changes a password makes a `staff` member of its own (`actor('staff', { fresh: true
// })`), removed when the worker ends, asks for the reset on the forgot page and takes the link from
// the member's email in the mail catcher (`mail`, ADR 0014). The pages start signed out: a
// signed-in member who opens a reset link is sent to the dashboard, so a second look at a link uses
// a new context (`actor('anonymous')`). Passwords come from the builders, which the run redacts.
//
// The email's link answers 404 (LOCAL-67); every case but TC-PWRESET-05 opens its token on the
// dashboard's reset page (`ResetPasswordPage.openLink`) until LOCAL-67 is fixed.

import { generatedPassword, type Account } from '../../../../helpers/actors';
import { knownGap } from '../../../../helpers/case-meta';
import { hasVisibleFocus } from '../../../../helpers/keyboard';
import { AuthApi } from '../../api/auth-api';
import {
  MIN_PASSWORD_LENGTH,
  aMadeUpToken,
  aPasswordOfLength,
} from '../../builders/password-builder';
import { ABORTED_FONT_DOWNLOAD, expect, test, type Actor } from '../../fixtures';
import { requestResetLink } from '../../flows/password-reset';
import { watchPasswordResets } from '../../mocks/auth-mocks';
import { ForgotPasswordPage } from '../../pages/forgot-password-page';
import { ResetPasswordPage } from '../../pages/reset-password-page';
import { SectionPage, storeIdOf } from '../../pages/section-page';

const SHORT = 'Password must be at least 8 characters';
const MISMATCH = 'Passwords do not match';
const DEAD_TOKEN = 'Password reset token is invalid or has expired.';
const ON_RESET = /\/dashboard\/reset-password\?token=/;
const ON_STORE = /\/dashboard\/store_[^/]+\/?$/;
const ON_FORGOT = /\/dashboard\/forgot-password$/;
// A reset answers in a moment; the dashboard it opens loads its reports after.
const ANSWER = { timeout: 15_000 };

test.use({ pageHealth: { allowConsole: [ABORTED_FONT_DOWNLOAD] } });

type ActorOf = (role: string, options?: { fresh: true }) => Promise<Actor>;

/** A staff member of the case's own, created through the admin API, and its signed-in actor. */
async function ownStaff(actor: ActorOf, qa: { allowWrites: boolean }) {
  test.skip(!qa.allowWrites, 'the case creates a staff member; allow_writes is false');
  const member = await actor('staff', { fresh: true });
  if (!member.account) throw new Error('A staff actor has an account.');
  return { member, account: member.account };
}

/**
 * Sign-ins checked through the API on a context of their own, without a session, so the sign-in's
 * cookie never lands in a context the case looks at.
 */
async function signIns(actor: ActorOf): Promise<AuthApi> {
  return new AuthApi((await actor('anonymous')).api);
}

/** The status a sign-in of `account` with `password` answers: 200 or 401. */
function signInWith(api: AuthApi, account: Account, password: string): Promise<number> {
  return api.signInStatus({ ...account, password });
}

test('TC-PWRESET-05 <RESET_LINK>, opened as the email gives it, shows "Choose a new password" with "New password" focused @regression @known-gap', async ({
  page,
  actor,
  qa,
  mail,
}) => {
  const { member, account } = await ownStaff(actor, qa);
  await member.context.close();
  const link = await requestResetLink(page, mail, account.username);
  const reset = new ResetPasswordPage(page);
  test.fail(
    true,
    await knownGap('LOCAL-67', 'the link leads to /reset-password, without /dashboard, a 404'),
  );

  await reset.openAsSent(link);

  await expect(reset.title()).toBeVisible();
  await expect(reset.newPassword()).toBeFocused();
});

test('TC-PWRESET-06 a staff member asks for a reset, opens <RESET_LINK>, types <NEW_PASSWORD> twice and lands signed in on /dashboard/<STORE_ID> with the heading "Dashboard"; afterwards <NEW_PASSWORD> signs in and the old password is refused @smoke @security', async ({
  page,
  actor,
  qa,
  mail,
}) => {
  const { member, account } = await ownStaff(actor, qa);
  await member.context.close();
  const next = generatedPassword();
  const link = await requestResetLink(page, mail, account.username);
  const reset = new ResetPasswordPage(page);
  await reset.openLink(link);
  await expect(reset.title()).toBeVisible();

  await reset.choose(next);

  await expect(page).toHaveURL(ON_STORE, ANSWER);
  await expect(new SectionPage(page, storeIdOf(page.url())).heading('Dashboard')).toBeVisible();
  expect(await new AuthApi(page.request).whoami()).toBe(account.username);
  const auth = await signIns(actor);
  expect(await signInWith(auth, account, next), 'the new password').toBe(200);
  expect(await signInWith(auth, account, account.password), 'the old password').toBe(401);
});

test('TC-PWRESET-07 "Reset password" with "New password" empty and with <PASSWORD_7> twice shows "Password must be at least 8 characters", marks the field invalid and sends no request; <PASSWORD_8> twice is accepted and the dashboard opens @regression', async ({
  page,
  actor,
  qa,
  mail,
}) => {
  const { member, account } = await ownStaff(actor, qa);
  await member.context.close();
  const link = await requestResetLink(page, mail, account.username);
  const reset = new ResetPasswordPage(page);
  const resets = watchPasswordResets(page);
  await reset.openLink(link);

  await test.step('empty is refused by the page', async () => {
    await reset.submit().click();
    await expect(reset.message(SHORT)).toBeVisible();
    await expect(reset.newPassword()).toHaveAttribute('aria-invalid', 'true');
  });
  await test.step(`${MIN_PASSWORD_LENGTH - 1} characters are refused by the page`, async () => {
    // A fresh form, so the message below is this step's and not the empty step's.
    await reset.openLink(link);
    await expect(reset.message(SHORT)).toHaveCount(0);
    await reset.choose(aPasswordOfLength(MIN_PASSWORD_LENGTH - 1));
    await expect(reset.message(SHORT)).toBeVisible();
    await expect(reset.newPassword()).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL(ON_RESET);
  });
  expect(resets.changed(), 'password changes sent').toBe(0);

  const eight = aPasswordOfLength(MIN_PASSWORD_LENGTH);
  await test.step(`${MIN_PASSWORD_LENGTH} characters are accepted`, async () => {
    await reset.choose(eight);
    await expect(page).toHaveURL(ON_STORE, ANSWER);
  });
  expect(resets.changed()).toBe(1);
  expect(await signInWith(await signIns(actor), account, eight)).toBe(200);
});

test('TC-PWRESET-08 "Reset password" with two different passwords shows "Passwords do not match" under "Confirm new password", marks it invalid and sends no request @regression', async ({
  page,
}) => {
  // The page checks the pair before it sends anything, so a token Spree never issued serves.
  const reset = new ResetPasswordPage(page);
  const resets = watchPasswordResets(page);
  await reset.open(aMadeUpToken());

  await reset.choose(generatedPassword(), generatedPassword());

  await expect(
    reset.fieldMessage(reset.confirmPassword(), reset.newPassword(), MISMATCH),
  ).toBeVisible();
  await expect(reset.confirmPassword()).toHaveAttribute('aria-invalid', 'true');
  await expect(reset.message(DEAD_TOKEN)).toHaveCount(0);
  await expect(page).toHaveURL(ON_RESET);
  expect(resets.changed()).toBe(0);
});

test('TC-PWRESET-09 <RESET_LINK>, opened again after it changed the password, shows the form, and "Reset password" says "Password reset token is invalid or has expired." and stays on the page; the password set by the first use still signs in @regression @security', async ({
  page,
  actor,
  qa,
  mail,
}) => {
  const { member, account } = await ownStaff(actor, qa);
  await member.context.close();
  const first = generatedPassword();
  const second = generatedPassword();
  const link = await requestResetLink(page, mail, account.username);
  const reset = new ResetPasswordPage(page);
  await reset.openLink(link);
  await reset.choose(first);
  await expect(page).toHaveURL(ON_STORE, ANSWER);

  // A context without a session: a signed-in member would be sent to the dashboard.
  const again = await actor('anonymous');
  const reopened = new ResetPasswordPage(again.page);
  await reopened.openLink(link);
  await expect(reopened.title()).toBeVisible();
  await reopened.choose(second);

  await expect(reopened.message(DEAD_TOKEN)).toBeVisible(ANSWER);
  await expect(again.page).toHaveURL(ON_RESET);
  const auth = await signIns(actor);
  expect(await signInWith(auth, account, first), 'the password of the first use').toBe(200);
  expect(await signInWith(auth, account, second), 'the password of the second use').toBe(401);
});

test('TC-PWRESET-10 of two links sent to <STAFF_EMAIL>, the newer one changes the password, and then the older one is refused with "Password reset token is invalid or has expired." @regression @security', async ({
  page,
  actor,
  qa,
  mail,
}) => {
  const { member, account } = await ownStaff(actor, qa);
  await member.context.close();
  const older = await requestResetLink(page, mail, account.username);
  const newer = await requestResetLink(page, mail, account.username);
  expect(newer === older, 'the two links are different').toBe(false);
  const next = generatedPassword();
  const reset = new ResetPasswordPage(page);
  await reset.openLink(newer);
  await reset.choose(next);
  await expect(page).toHaveURL(ON_STORE, ANSWER);

  const again = await actor('anonymous');
  const stale = new ResetPasswordPage(again.page);
  await stale.openLink(older);
  await stale.choose(generatedPassword());

  await expect(stale.message(DEAD_TOKEN)).toBeVisible(ANSWER);
  await expect(again.page).toHaveURL(ON_RESET);
  expect(await signInWith(await signIns(actor), account, next)).toBe(200);
});

test('TC-PWRESET-11 /dashboard/reset-password with <MADE_UP_TOKEN> shows the form, and "Reset password" with a valid pair says "Password reset token is invalid or has expired." and stays on the page @regression @security', async ({
  page,
}) => {
  const reset = new ResetPasswordPage(page);
  const resets = watchPasswordResets(page);
  await reset.open(aMadeUpToken());
  await expect(reset.title()).toBeVisible();
  await expect(reset.message(DEAD_TOKEN)).toHaveCount(0);

  await reset.choose(generatedPassword());

  await expect(reset.message(DEAD_TOKEN)).toBeVisible(ANSWER);
  await expect(page).toHaveURL(ON_RESET);
  expect(resets.changed()).toBe(1);
  expect(await new AuthApi(page.request).whoami()).toBeNull();
});

test('TC-PWRESET-12 /dashboard/reset-password without a token shows "Invalid reset link", "This password reset link is missing its token." and "Request a new reset link", which leads to /dashboard/forgot-password @regression @navigation', async ({
  page,
}) => {
  const reset = new ResetPasswordPage(page);
  await reset.openWithoutToken();

  await expect(reset.invalidLink()).toBeVisible();
  await expect(reset.missingToken()).toBeVisible();
  await expect(reset.newPassword()).toHaveCount(0);

  await reset.requestNewLink().click();

  await expect(page).toHaveURL(ON_FORGOT);
  await expect(new ForgotPasswordPage(page).heading()).toBeVisible();
});

test('TC-PWRESET-13 "New password" and "Confirm new password" both mask what is typed: `type=password`, and the typed value is not shown @regression @security', async ({
  page,
}) => {
  // Nothing is sent: the value only fills the fields.
  const typed = generatedPassword();
  const reset = new ResetPasswordPage(page);
  await reset.open(aMadeUpToken());

  for (const field of [reset.newPassword(), reset.confirmPassword()]) {
    await field.fill(typed);
    await expect(field).toHaveAttribute('type', 'password');
    await expect(field).toHaveValue(typed);
  }
  await expect(reset.message(typed)).toHaveCount(0);
});

test('TC-PWRESET-14 a session the staff member opened before the reset can no longer renew itself after it, while the session the reset opened can @regression @security', async ({
  page,
  actor,
  qa,
  mail,
}) => {
  const { member, account } = await ownStaff(actor, qa);
  // The member's own signed-in context stays open across the reset.
  const before = new AuthApi(member.page.request);
  expect(await before.whoami(), 'the session before the reset').toBe(account.username);
  // A control: the session renews itself again and again until the reset, so its end is the reset's.
  expect(await before.whoami(), 'the session renewed once more').toBe(account.username);
  const link = await requestResetLink(page, mail, account.username);
  const reset = new ResetPasswordPage(page);
  await reset.openLink(link);

  await reset.choose(generatedPassword());

  await expect(page).toHaveURL(ON_STORE, ANSWER);
  // The dashboard has renewed its own session before the case renews it again.
  await expect(new SectionPage(page, storeIdOf(page.url())).heading('Dashboard')).toBeVisible();
  expect(await new AuthApi(page.request).whoami(), 'the session the reset opened').toBe(
    account.username,
  );
  expect(await before.whoami(), 'the session before the reset, afterwards').toBeNull();
});

test('TC-PWRESET-16 on the reset page "New password" has the focus, Tab reaches "Confirm new password" and "Reset password" in that order with a visible focus, and Enter in "Confirm new password" submits @regression @a11y', async ({
  page,
}) => {
  const typed = generatedPassword();
  const reset = new ResetPasswordPage(page);
  const resets = watchPasswordResets(page);
  // A token Spree never issued: the submit is seen by the token's refusal.
  await reset.open(aMadeUpToken());
  await expect(reset.newPassword()).toBeFocused();
  await page.keyboard.type(typed);
  expect(await hasVisibleFocus(reset.newPassword()), 'focus visible on New password').toBe(true);

  const order = [
    ['Confirm new password', reset.confirmPassword()],
    ['Reset password', reset.submit()],
  ] as const;
  for (const [name, control] of order) {
    await test.step(`Tab to ${name}`, async () => {
      await page.keyboard.press('Tab');
      await expect(control).toBeFocused();
      if (name === 'Confirm new password') await page.keyboard.type(typed);
      expect(await hasVisibleFocus(control), `focus visible on ${name}`).toBe(true);
    });
  }

  await test.step('Enter in Confirm new password submits', async () => {
    await reset.confirmPassword().focus();
    await page.keyboard.press('Enter');
    await expect(reset.message(DEAD_TOKEN)).toBeVisible(ANSWER);
    expect(resets.changed()).toBe(1);
  });
});

test('TC-PWRESET-21 the reset page has a level-1 heading, "Choose a new password" or "Invalid reset link", and a title that names the page @regression @a11y @known-gap', async ({
  page,
  actor,
}) => {
  const reset = new ResetPasswordPage(page);
  await reset.open(aMadeUpToken());
  await expect(reset.title()).toBeVisible();
  // The missing-token state on a page of its own, opened before the arm.
  const other = await actor('anonymous');
  const missing = new ResetPasswordPage(other.page);
  await missing.openWithoutToken();
  test.fail(
    true,
    await knownGap('LOCAL-68', 'the reset page has no heading and the title "Spree Admin"'),
  );

  await expect.soft(reset.heading()).toHaveAccessibleName('Choose a new password');
  await expect.soft(page).toHaveTitle(/password/i);
  await expect.soft(missing.heading()).toHaveAccessibleName('Invalid reset link');
  await expect.soft(other.page).toHaveTitle(/reset link/i);
});

test('TC-PWRESET-24 a link whose token is not valid says so when it opens, without the form, and offers a way to ask for a new one @regression @known-gap', async ({
  page,
}) => {
  const reset = new ResetPasswordPage(page);
  test.fail(
    true,
    await knownGap('LOCAL-69', 'a dead link shows the form and is refused only on submit'),
  );

  await reset.visit(aMadeUpToken());

  await expect(reset.linkRefused()).toBeVisible();
  await expect(reset.newPassword()).toHaveCount(0);
  await expect(reset.requestNewLink()).toBeVisible();
});
