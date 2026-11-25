// What both password reset pages owe every user, whatever they type (registry/password-reset.md):
// nothing typed in the URL or storage, no sideways scroll, a healthy page, axe and what a screen
// reader or a password manager is told. The states that need no account use an unknown email or a
// token Spree never issued; the one case that changes a password makes a `staff` member of its own
// and reads its email from the mail catcher (`mail`, ADR 0014).

import { generatedPassword } from '../../../../helpers/actors';
import { knownGap } from '../../../../helpers/case-meta';
import { horizontalOverflow, unloadedImages } from '../../../../helpers/layout';
import { storedText } from '../../../../helpers/storage';
import { aMadeUpToken, aPasswordOfLength } from '../../builders/password-builder';
import { anUnknownEmail } from '../../builders/staff-builder';
import { ABORTED_FONT_DOWNLOAD, expect, test } from '../../fixtures';
import { linkMatching } from '../../../../helpers/mail-catcher';
import { RESET_LINK, RESET_SUBJECT } from '../../flows/password-reset';
import { ForgotPasswordPage } from '../../pages/forgot-password-page';
import { ResetPasswordPage, tokenOf } from '../../pages/reset-password-page';
import { SectionPage, storeIdOf } from '../../pages/section-page';
import { UserMenu } from '../../components/user-menu';

const EMAIL_MESSAGE = 'Invalid email address';
const SHORT = 'Password must be at least 8 characters';
const MISMATCH = 'Passwords do not match';
const DEAD_TOKEN = 'Password reset token is invalid or has expired.';
const ON_STORE = /\/dashboard\/store_[^/]+\/?$/;
const ANSWER = { timeout: 15_000 };

test.use({ pageHealth: { allowConsole: [ABORTED_FONT_DOWNLOAD] } });

test('TC-PWRESET-17 neither <STAFF_EMAIL> nor the password appears in the URL or in browser storage after "Send reset link" and after the reset, and once the reset is done the URL no longer holds the token @regression @security', async ({
  page,
  actor,
  qa,
  mail,
}) => {
  test.skip(!qa.allowWrites, 'the case creates a staff member; allow_writes is false');
  const member = await actor('staff', { fresh: true });
  if (!member.account) throw new Error('A staff actor has an account.');
  await member.context.close();
  const email = member.account.username;
  const next = generatedPassword();
  const forgot = new ForgotPasswordPage(page);
  const reset = new ResetPasswordPage(page);
  // What must not appear, as typed and as a URL would encode it. Failures name the label, never
  // the value.
  const typed = [
    { label: 'the email', value: email },
    { label: 'the new password', value: next },
  ];
  const leaked = (text: string) =>
    typed
      .filter(({ value }) => text.includes(value) || text.includes(encodeURIComponent(value)))
      .map(({ label }) => label);

  await test.step('after "Send reset link"', async () => {
    await forgot.open();
    await forgot.request(email);
    await expect(forgot.confirmation()).toBeVisible(ANSWER);
    await expect(page).toHaveURL((url) => leaked(url.href).length === 0);
    expect(leaked(await storedText(page)), 'typed values found in browser storage').toEqual([]);
  });
  // The email of that one request; its token joins what must not stay in the URL.
  const message = await mail.waitForMessage(email, { subject: RESET_SUBJECT });
  const link = linkMatching(message, RESET_LINK);
  typed.push({ label: 'the token', value: tokenOf(link) });
  await test.step('after the reset', async () => {
    await reset.openLink(link);
    await reset.choose(next);
    await expect(page).toHaveURL(ON_STORE, ANSWER);
    // The dashboard has loaded the member (the user menu) before storage is read.
    await expect(new SectionPage(page, storeIdOf(page.url())).heading('Dashboard')).toBeVisible();
    await expect(new UserMenu(page).button()).toBeVisible();
    await expect(page).toHaveURL((url) => leaked(url.href).length === 0 && url.search === '');
    expect(leaked(await storedText(page)), 'typed values found in browser storage').toEqual([]);
  });
});

test('TC-PWRESET-18 neither page scrolls sideways: the forgot page in its initial, invalid and sent states, the reset page in its initial, invalid, refused and missing-token states @regression @responsive', async ({
  page,
}) => {
  const forgot = new ForgotPasswordPage(page);
  const reset = new ResetPasswordPage(page);
  const noScroll = (state: string) =>
    expect.poll(() => horizontalOverflow(page), { message: state }).toBe(0);

  await forgot.open();
  await expect(forgot.heading()).toBeVisible();
  await noScroll('forgot, initial');
  await forgot.send().click();
  await expect(forgot.message(EMAIL_MESSAGE)).toBeVisible();
  await noScroll('forgot, invalid');
  await forgot.request(anUnknownEmail(test.info().workerIndex));
  await expect(forgot.confirmation()).toBeVisible(ANSWER);
  await noScroll('forgot, sent');

  await reset.open(aMadeUpToken());
  await expect(reset.title()).toBeVisible();
  await noScroll('reset, initial');
  await reset.choose(generatedPassword(), generatedPassword());
  await expect(reset.message(MISMATCH)).toBeVisible();
  await noScroll('reset, invalid');
  await reset.choose(generatedPassword());
  await expect(reset.message(DEAD_TOKEN)).toBeVisible(ANSWER);
  await noScroll('reset, refused');
  await reset.openWithoutToken();
  await expect(reset.invalidLink()).toBeVisible();
  await noScroll('reset, missing token');
});

test('TC-PWRESET-19 both pages load with no broken image, failed request, console error or uncaught exception, in the sent state and with a refused token too @regression @layout', async ({
  page,
}) => {
  // The page health guard checks the requests, the console and the exceptions when the case ends.
  const forgot = new ForgotPasswordPage(page);
  const reset = new ResetPasswordPage(page);

  await forgot.open();
  await expect(forgot.heading()).toBeVisible();
  await expect.poll(() => unloadedImages(forgot.images()), { message: 'forgot' }).toEqual([]);
  await forgot.request(anUnknownEmail(test.info().workerIndex));
  await expect(forgot.confirmation()).toBeVisible(ANSWER);
  await expect.poll(() => unloadedImages(forgot.images()), { message: 'sent' }).toEqual([]);

  await reset.open(aMadeUpToken());
  await expect(reset.title()).toBeVisible();
  await expect.poll(() => unloadedImages(reset.images()), { message: 'reset' }).toEqual([]);
  await reset.choose(generatedPassword());
  await expect(reset.message(DEAD_TOKEN)).toBeVisible(ANSWER);
  await expect.poll(() => unloadedImages(reset.images()), { message: 'refused' }).toEqual([]);
});

test('TC-PWRESET-20 the forgot page (initial, invalid, sent) and the reset page (initial, invalid, refused, missing token) have no axe violation beyond the baseline @regression @a11y', async ({
  page,
  a11y,
}) => {
  // Seven axe scans in one case outlast the default timeout on Firefox.
  test.slow();
  const forgot = new ForgotPasswordPage(page);
  const reset = new ResetPasswordPage(page);
  const steps: [string, () => Promise<void>][] = [
    [
      'forgot, initial',
      async () => {
        await forgot.open();
        await expect(forgot.heading()).toBeVisible();
      },
    ],
    [
      'forgot, invalid',
      async () => {
        await forgot.send().click();
        await expect(forgot.message(EMAIL_MESSAGE)).toBeVisible();
      },
    ],
    [
      'forgot, sent',
      async () => {
        await forgot.request(anUnknownEmail(test.info().workerIndex));
        await expect(forgot.confirmation()).toBeVisible(ANSWER);
      },
    ],
    [
      'reset, initial',
      async () => {
        await reset.open(aMadeUpToken());
        await expect(reset.title()).toBeVisible();
      },
    ],
    [
      'reset, invalid',
      async () => {
        await reset.submit().click();
        await expect(reset.message(SHORT)).toBeVisible();
      },
    ],
    [
      'reset, refused',
      async () => {
        await reset.choose(generatedPassword());
        await expect(reset.message(DEAD_TOKEN)).toBeVisible(ANSWER);
      },
    ],
    [
      'reset, missing token',
      async () => {
        await reset.openWithoutToken();
        await expect(reset.invalidLink()).toBeVisible();
      },
    ],
  ];
  for (const [state, reach] of steps) {
    await test.step(state, async () => {
      await reach();
      await a11y.expectNoNewViolations(page);
    });
  }
});

test('TC-PWRESET-22 the field messages and the token message are announced (an `alert` or `status` role, or a live region), and each field message is tied to its field through `aria-describedby` @regression @a11y @known-gap', async ({
  page,
  actor,
}) => {
  // Four contexts, then seven soft checks that each wait out their timeout while LOCAL-45 is open:
  // longer than the default on WebKit.
  test.slow();
  // Each state on a page of its own, reached and its message seen before the arm, so a broken
  // step can never pass for the gap. The messages themselves are TC-PWRESET-02, 07, 08 and 11's,
  // which run unarmed.
  const refused = new ResetPasswordPage(page);
  await refused.open(aMadeUpToken());
  await refused.choose(generatedPassword());
  await expect(refused.message(DEAD_TOKEN)).toBeVisible(ANSWER);

  const short = new ResetPasswordPage((await actor('anonymous')).page);
  await short.open(aMadeUpToken());
  await short.choose(aPasswordOfLength(7));
  await expect(short.message(SHORT)).toBeVisible();

  const mismatched = new ResetPasswordPage((await actor('anonymous')).page);
  await mismatched.open(aMadeUpToken());
  await mismatched.choose(generatedPassword(), generatedPassword());
  await expect(mismatched.message(MISMATCH)).toBeVisible();

  const forgot = new ForgotPasswordPage((await actor('anonymous')).page);
  await forgot.open();
  await forgot.send().click();
  await expect(forgot.message(EMAIL_MESSAGE)).toBeVisible();

  test.fail(
    true,
    await knownGap('LOCAL-45', 'the reset messages are plain paragraphs, outside any live region'),
  );

  // Soft, so every claim is read: each message's announcement, and each field message's tie. A
  // description that adds a hint to the message still ties it, so the tie is matched in part.
  await expect.soft(refused.announcement(DEAD_TOKEN)).toBeVisible();
  await expect.soft(short.announcement(SHORT)).toBeVisible();
  await expect.soft(short.newPassword()).toHaveAccessibleDescription(new RegExp(SHORT));
  await expect.soft(mismatched.announcement(MISMATCH)).toBeVisible();
  await expect.soft(mismatched.confirmPassword()).toHaveAccessibleDescription(new RegExp(MISMATCH));
  await expect.soft(forgot.announcement(EMAIL_MESSAGE)).toBeVisible();
  await expect.soft(forgot.email()).toHaveAccessibleDescription(new RegExp(EMAIL_MESSAGE));
});

test('TC-PWRESET-23 Email declares its purpose (`autocomplete` `email` or `username`) and the two password fields declare `new-password` @regression @a11y @known-gap', async ({
  page,
  actor,
}) => {
  // Both pages open, each on its own, before the arm.
  const forgot = new ForgotPasswordPage(page);
  await forgot.open();
  await expect(forgot.email()).toBeVisible();
  const reset = new ResetPasswordPage((await actor('anonymous')).page);
  await reset.open(aMadeUpToken());
  await expect(reset.newPassword()).toBeVisible();
  test.fail(true, await knownGap('LOCAL-46', 'the reset fields carry no autocomplete'));

  await expect.soft(forgot.email()).toHaveAttribute('autocomplete', /^(email|username)$/);
  await expect.soft(reset.newPassword()).toHaveAttribute('autocomplete', 'new-password');
  await expect.soft(reset.confirmPassword()).toHaveAttribute('autocomplete', 'new-password');
});
