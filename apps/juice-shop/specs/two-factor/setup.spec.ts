// Two-factor setup and removal on `/#/privacy-security/two-factor-authentication`
// (registry/two-factor.md). A case that turns the setting on or off takes a customer of its own: it
// changes how the account signs in. The cases that only read the setup form use the worker's
// customer, whose setting is never turned on. Codes come from the secret the page received
// (`openForSetup`), made by `helpers/totp.ts`; wrong passwords are generated, so the redaction
// reporter knows them.

import type { Locator } from '@playwright/test';
import { generatedPassword } from '../../../../helpers/actors';
import { knownGap } from '../../../../helpers/case-meta';
import { focusChangesRendering, tabUntil } from '../../../../helpers/keyboard';
import { freshTotp } from '../../../../helpers/totp';
import { loadDecisionTable } from '../../../../scripts/lib/decision-table.mjs';
import { AccountApi } from '../../api/account-api';
import { TwoFactorApi } from '../../api/two-factor-api';
import { aWrongCode } from '../../builders/two-factor-codes';
import { expect, test } from '../../fixtures';
import { aTwoFactorCustomer } from '../../flows/two-factor';
import { TwoFactorSetupPage } from '../../pages/two-factor-setup-page';

// Every load of the setup page logs this error until LOCAL-61 is fixed; TC-TWOFACTOR-24 keeps it
// visible as a known gap, so the other cases allow it.
const QR_ERROR = /\[angularx-qrcode\] Error generating QR Code/;
test.use({ pageHealth: { allowConsole: [QR_ERROR] } });

// The first check after a submit waits for the server's answer, slower on a busy container.
const ANSWER = { timeout: 15_000 };

test('TC-TWOFACTOR-01 with two-factor authentication off, the setup page shows the instructions, the QR code, Current Password, Initial Token and Save disabled @sanity', async ({
  customer,
}) => {
  const setup = new TwoFactorSetupPage(customer.page);

  await setup.openForSetup();
  await expect(setup.title()).toBeVisible();
  await expect(setup.instructions()).toBeVisible();
  await expect(setup.qrCode()).toBeVisible();
  for (const control of [setup.password(), setup.token(), setup.save()]) {
    await expect(control).toBeVisible();
  }
  await expect(setup.password()).toHaveValue('');
  await expect(setup.token()).toHaveValue('');
  await expect(setup.save()).toBeDisabled();
  await expect(setup.removalTitle()).toHaveCount(0);
});

test('TC-TWOFACTOR-02 Save with the password and <CODE> turns it on: the enabled text, the confirmation and the removal form show, and the status answers that it is set up @smoke', async ({
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  const customer = await actor('customer', { fresh: true });
  if (!customer.account) throw new Error('A customer has an account.');
  const setup = new TwoFactorSetupPage(customer.page);

  const secret = await setup.openForSetup();
  await setup.setUp(customer.account.password, await freshTotp(secret));

  await expect(setup.enabled()).toBeVisible(ANSWER);
  await expect(setup.setUpConfirmation()).toBeVisible();
  await expect(setup.removalTitle()).toBeVisible();
  await expect(setup.remove()).toBeVisible();
  await expect(setup.token()).toHaveCount(0);
  expect((await new TwoFactorApi(customer.api).status()).setup).toBe(true);
});

test('TC-TWOFACTOR-03 Save with a wrong password, and then with a wrong code, shows "Failed to change 2FA setup…" each time, and the status still answers that it is off @regression @security', async ({
  actor,
  qa,
}) => {
  test.skip(
    !qa.allowWrites,
    'the case sends the setup of an account it creates; allow_writes is false',
  );
  const customer = await actor('customer', { fresh: true });
  if (!customer.account) throw new Error('A customer has an account.');
  const setup = new TwoFactorSetupPage(customer.page);
  const twoFactor = new TwoFactorApi(customer.api);
  // The secret of the reload, the only one the page can still set up with.
  let reloaded = '';

  await test.step('a wrong password with the right code: the failure, still off', async () => {
    const secret = await setup.openForSetup();
    await setup.setUp(generatedPassword(), await freshTotp(secret));
    await expect(setup.failure()).toBeVisible(ANSWER);
    await expect(setup.enabled()).toHaveCount(0);
    expect((await twoFactor.status()).setup).toBe(false);
  });

  await test.step('reload: no failure message, the setup form again', async () => {
    // So the next failure cannot be the one the wrong password left.
    reloaded = await setup.reloadForSetup();
    await expect(setup.save()).toBeDisabled();
    await expect(setup.failure()).toBeHidden();
  });

  await test.step('the right password with a wrong code: the failure, still off', async () => {
    await setup.setUp(customer.account!.password, aWrongCode(reloaded));
    await expect(setup.failure()).toBeVisible(ANSWER);
    await expect(setup.enabled()).toHaveCount(0);
    expect((await twoFactor.status()).setup).toBe(false);
  });
});

test('TC-TWOFACTOR-04 Save is enabled only with a password and a six-digit token, walking every combination of rules/TC-TWOFACTOR-04.yaml @regression @navigation', async ({
  customer,
}) => {
  // Nothing is sent: the values only fill the form, so the worker's customer stays as it is.
  const setup = new TwoFactorSetupPage(customer.page);
  const password = { empty: '', filled: generatedPassword() };
  const token: Record<string, string> = {
    empty: '',
    five_digits: '12345',
    six_letters: 'abcdef',
    six_digits: '123456',
  };
  const fill = async (passwordValue: string, tokenValue: string) => {
    await setup.password().fill(passwordValue);
    await setup.token().fill(tokenValue);
    await expect(setup.password()).toHaveValue(passwordValue);
    await expect(setup.token()).toHaveValue(tokenValue);
  };

  await setup.openForSetup();
  for (const { when, then } of loadDecisionTable('apps/juice-shop/rules/TC-TWOFACTOR-04.yaml')) {
    const enabled = then['save'] === 'enabled';
    await test.step(`password ${when['password']}, token ${when['token']}: Save ${then['save']}`, async () => {
      // Each combination is reached from the opposite state, so no check passes on the state the
      // step before it left.
      await fill(enabled ? '' : password.filled, enabled ? '' : token['six_digits']!);
      await expect(setup.save()).toBeEnabled({ enabled: !enabled });
      const tokenValue = token[when['token'] as string];
      // A value the table adds without one here must not become an empty field.
      if (tokenValue === undefined) throw new Error(`No value for token "${when['token']}".`);
      await fill(when['password'] === 'filled' ? password.filled : '', tokenValue);
      await expect(setup.save()).toBeEnabled({ enabled });
    });
  }
});

test('TC-TWOFACTOR-05 leaving Current Password and Initial Token empty asks for each of them @regression @known-gap', async ({
  customer,
}) => {
  const setup = new TwoFactorSetupPage(customer.page);
  // REQ-TWOFACTOR-15 says each empty field says what is missing, not in which words: the case
  // checks that a message shows under each field, and that the token's is not the invalid one.
  const INVALID = 'The token appears to be invalid.';
  await setup.openForSetup();
  await expect(setup.passwordMessage()).toHaveCount(0);
  await expect(setup.tokenMessage()).toHaveCount(0);

  test.fail(
    true,
    await knownGap(
      'LOCAL-66',
      'an empty token field says it is invalid and an empty password field says nothing',
    ),
  );
  await test.step('leave both fields empty', async () => {
    await setup.password().focus();
    await setup.token().focus();
    await setup.password().focus();
  });

  await test.step('the password field says what is missing', async () => {
    await expect(setup.passwordMessage()).toBeVisible();
    await expect(setup.passwordMessage()).not.toHaveText('');
  });

  await test.step('the token field asks for the token instead of calling it invalid', async () => {
    await expect(setup.tokenMessage()).toBeVisible();
    await expect(setup.tokenMessage()).not.toHaveText(INVALID);
  });
});

test('TC-TWOFACTOR-06 a successful setup after a refused one shows the enabled text without the earlier failure message @regression @known-gap', async ({
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  const customer = await actor('customer', { fresh: true });
  if (!customer.account) throw new Error('A customer has an account.');
  const setup = new TwoFactorSetupPage(customer.page);

  const secret = await setup.openForSetup();
  await setup.setUp(generatedPassword(), await freshTotp(secret));
  await expect(setup.failure()).toBeVisible(ANSWER);

  // The second setup must succeed on its own merits, outside the arm: only the stale message is
  // the gap.
  await setup.setUp(customer.account.password, await freshTotp(secret));
  await expect(setup.enabled()).toBeVisible(ANSWER);

  test.fail(true, await knownGap('LOCAL-65', 'the failure message stays after a later success'));
  await expect(setup.failure()).toBeHidden();
});

test('TC-TWOFACTOR-07 a reload of the setup page keeps its state: the removal form while it is on, the setup form while it is off @regression @navigation', async ({
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  const customer = await actor('customer', { fresh: true });
  if (!customer.account) throw new Error('A customer has an account.');
  const setup = new TwoFactorSetupPage(customer.page);

  await test.step('off: a reload shows the setup form again', async () => {
    await setup.openForSetup();
    await setup.reload();
    await expect(setup.save()).toBeVisible();
    await expect(setup.qrCode()).toBeVisible();
    await expect(setup.removalTitle()).toHaveCount(0);
  });

  await test.step('on: a reload shows the removal form again', async () => {
    await new TwoFactorApi(customer.api).enable(customer.account!.password);
    await setup.reload();
    await expect(setup.removalTitle()).toBeVisible();
    await setup.reload();
    await expect(setup.removalTitle()).toBeVisible();
    await expect(setup.enabled()).toBeVisible();
    await expect(setup.token()).toHaveCount(0);
  });
});

test('TC-TWOFACTOR-17 Remove with the password turns it off: "Two-Factor Authentication has been removed.", the setup form returns, and the password alone signs in @regression', async ({
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  const { customer, account } = await aTwoFactorCustomer(actor);
  const setup = new TwoFactorSetupPage(customer.page);

  await setup.open();
  await expect(setup.removalTitle()).toBeVisible();
  await setup.removeWith(account.password);

  await expect(setup.removedConfirmation()).toBeVisible(ANSWER);
  await expect(setup.token()).toBeVisible();
  await expect(setup.save()).toBeVisible();
  await expect(setup.removalTitle()).toHaveCount(0);
  expect((await new TwoFactorApi(customer.api).status()).setup).toBe(false);
  // The password alone signs in again: the login answers a session, not a request for a code.
  await expect(new AccountApi(customer.api).login(account)).resolves.toHaveProperty('token');
});

test('TC-TWOFACTOR-18 Remove with a wrong password shows the failure message, and the next login still asks for a code @regression @security', async ({
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  const { customer, account } = await aTwoFactorCustomer(actor);
  const setup = new TwoFactorSetupPage(customer.page);
  const twoFactor = new TwoFactorApi(customer.api);

  await setup.open();
  await expect(setup.removalTitle()).toBeVisible();
  await setup.removeWith(generatedPassword());

  await expect(setup.failure()).toBeVisible(ANSWER);
  await expect(setup.removalTitle()).toBeVisible();
  await expect(setup.removedConfirmation()).toBeHidden();
  expect((await twoFactor.status()).setup).toBe(true);
  // pendingLogin throws unless the login asks for a code.
  await expect(twoFactor.pendingLogin(account)).resolves.toEqual(expect.any(String));
});

test('TC-TWOFACTOR-19 the setup form is filled and sent with the keyboard alone, the focus visible on each control in reading order @regression @a11y', async ({
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  const customer = await actor('customer', { fresh: true });
  if (!customer.account) throw new Error('A customer has an account.');
  const { page, account } = customer;
  const setup = new TwoFactorSetupPage(page);
  // Angular Material draws the focus on a wrapper, so the check compares how the region around
  // the control is drawn at rest and with focus, once a text field holds a value (as TC-LOGIN-07).
  const focusIsVisible = async (control: Locator, region: Locator, name: string) =>
    expect(await focusChangesRendering(control, region), `focus visible on ${name}`).toBe(true);

  const secret = await setup.openForSetup();
  await expect(setup.save()).toBeDisabled();

  await test.step('Tab from the top of the page to Current Password', async () => {
    // The toolbar's buttons come first, and how many depends on the device's toolbar.
    await tabUntil(page, setup.password(), 20);
    await expect(setup.password()).toBeFocused();
  });

  await test.step('type the password, Tab to Initial Token and type the code', async () => {
    await page.keyboard.type(account!.password);
    await focusIsVisible(setup.password(), setup.passwordField(), 'Current Password');
    await setup.password().focus();
    await page.keyboard.press('Tab');
    await expect(setup.token()).toBeFocused();
    // A margin of 15 s: the rest of the case must reach the server inside the code's step.
    await page.keyboard.type(await freshTotp(secret, { marginMs: 15_000 }));
    await focusIsVisible(setup.token(), setup.tokenField(), 'Initial Token');
    await setup.token().focus();
  });

  await test.step('Tab to Save and press Enter: two-factor authentication is on', async () => {
    await page.keyboard.press('Tab');
    await expect(setup.save()).toBeFocused();
    await focusIsVisible(setup.save(), setup.save(), 'Save');
    await setup.save().focus();
    await page.keyboard.press('Enter');
    await expect(setup.enabled()).toBeVisible(ANSWER);
    expect((await new TwoFactorApi(customer.api).status()).setup).toBe(true);
  });
});

test('TC-TWOFACTOR-22 the QR code has a text alternative, and the secret can be read as text @regression @a11y @known-gap', async ({
  customer,
}) => {
  const setup = new TwoFactorSetupPage(customer.page);
  const secret = await setup.openForSetup();
  await expect(setup.qrCode()).toBeVisible();

  test.fail(
    true,
    await knownGap('LOCAL-60', 'the QR code has no text alternative and the secret is not shown'),
  );
  await expect(setup.qrImage(), 'the QR code as an image with a name').toBeVisible();
  await expect(setup.secretText(secret), 'the secret as text').toBeVisible();
});

test('TC-TWOFACTOR-24 the setup page, off and on, loads without a console error @regression @layout @known-gap', async ({
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  const customer = await actor('customer', { fresh: true });
  if (!customer.account) throw new Error('A customer has an account.');
  const { page } = customer;
  const setup = new TwoFactorSetupPage(page);
  // The guard allows the QR error in this file; this case collects every console error itself.
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  test.fail(true, await knownGap('LOCAL-61', 'every load of the setup page logs a QR code error'));
  await test.step('off: the page loads without a console error', async () => {
    await setup.openForSetup();
    expect(errors, 'console errors with the setting off').toEqual([]);
  });

  await test.step('on: the page loads without a console error', async () => {
    await new TwoFactorApi(customer.api).enable(customer.account!.password);
    await setup.reload();
    await expect(setup.removalTitle()).toBeVisible();
    expect(errors, 'console errors with the setting on').toEqual([]);
  });
});
