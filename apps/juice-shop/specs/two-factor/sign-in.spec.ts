// The code step of a login, `/#/2fa/enter` (registry/two-factor.md). Each case arranges a customer of
// its own with two-factor authentication on through the API (`aTwoFactorCustomer`), then signs in
// on the case's own page, which starts signed out; that page's API client (`page.request`) shares
// its cookies, so `whoami` reads the session the page holds. Codes come from the account's secret,
// made by `helpers/totp.ts` on the real clock, which the server reads too.

import type { Locator } from '@playwright/test';
import { knownGap } from '../../../../helpers/case-meta';
import { focusChangesRendering, tabUntil } from '../../../../helpers/keyboard';
import { horizontalOverflow } from '../../../../helpers/layout';
import { browserStorage } from '../../../../helpers/storage';
import { rememberSecret } from '../../../../helpers/run-secrets';
import { freshTotp, totp } from '../../../../helpers/totp';
import { AccountApi } from '../../api/account-api';
import { TwoFactorApi } from '../../api/two-factor-api';
import { aWrongCode } from '../../builders/two-factor-codes';
import { AccountMenu } from '../../components/account-menu';
import { expect, test } from '../../fixtures';
import { aTwoFactorCustomer, passwordStep } from '../../flows/two-factor';
import { TwoFactorCodePage } from '../../pages/two-factor-code-page';
import { TwoFactorSetupPage } from '../../pages/two-factor-setup-page';

// The setup page, which TC-TWOFACTOR-21 and -25 open, logs this error until LOCAL-61 is fixed.
const QR_ERROR = /\[angularx-qrcode\] Error generating QR Code/;
test.use({ pageHealth: { allowConsole: [QR_ERROR] } });

// The first check after a submit waits for the server's answer, slower on a busy container.
const ANSWER = { timeout: 15_000 };
// Cases that check codes of neighbouring steps make them inside one step with this much left, so no
// code turns into another step's on its way to the server.
const STEP_MARGIN = { marginMs: 12_000 };

test('TC-TWOFACTOR-08 with two-factor authentication on, the password of <EMAIL> moves the login to /#/2fa/enter, and no session starts @regression @security', async ({
  page,
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  const { account } = await aTwoFactorCustomer(actor);
  const code = new TwoFactorCodePage(page);

  await passwordStep(page, account);
  await expect(page).toHaveURL(/#\/2fa\/enter$/);
  await expect(code.title()).toBeVisible();
  await expect(code.token()).toBeVisible();

  expect(await new AccountApi(page.request).whoami(), 'the session after the password').toBeNull();
  const stored = await browserStorage(page);
  expect(Object.keys(stored.localStorage), 'a token in local storage').not.toContain('token');
  expect(Object.keys(stored.cookies), 'a token cookie').not.toContain('token');
});

test('TC-TWOFACTOR-09 <CODE> on /#/2fa/enter signs in: the page moves to /#/search and the account menu shows <EMAIL> @smoke', async ({
  page,
  actor,
  app,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  const { account, secret } = await aTwoFactorCustomer(actor);
  const code = new TwoFactorCodePage(page);

  await passwordStep(page, account);
  await code.enter(await freshTotp(secret));
  await expect(page).toHaveURL(/#\/search$/, ANSWER);

  const menu = AccountMenu.for(page, app);
  await menu.open();
  await expect(menu.account(account.username)).toBeVisible();
  expect(await new AccountApi(page.request).whoami()).toBe(account.username);
});

test('TC-TWOFACTOR-10 a wrong code shows "The token appears to be invalid.", the page stays on /#/2fa/enter and no session starts @regression @security', async ({
  page,
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  const { account, secret } = await aTwoFactorCustomer(actor);
  const code = new TwoFactorCodePage(page);

  await passwordStep(page, account);
  await expect(code.invalid()).toBeHidden();
  await code.enter(aWrongCode(secret));

  await expect(code.invalid()).toBeVisible(ANSWER);
  await expect(page).toHaveURL(/#\/2fa\/enter$/);
  expect(await new AccountApi(page.request).whoami()).toBeNull();
});

test('TC-TWOFACTOR-11 Log in on /#/2fa/enter stays disabled when the field is empty, holds five digits or six letters, is enabled with six digits, and a seventh digit is not taken @regression @navigation', async ({
  page,
}) => {
  // Nothing is sent: the values only fill the field, so no account is needed.
  const code = new TwoFactorCodePage(page);
  const cases: [string, string, boolean][] = [
    ['empty', '', false],
    ['five digits', '12345', false],
    ['six letters', 'abcdef', false],
    ['six digits', '123456', true],
  ];

  await code.open();
  await expect(code.title()).toBeVisible();
  for (const [label, value, enabled] of cases) {
    await test.step(`${label}: Log in ${enabled ? 'enabled' : 'disabled'}`, async () => {
      // Reached from the opposite state, so no check passes on what the step before left.
      await code.token().fill(enabled ? '' : '123456');
      await expect(code.submit()).toBeEnabled({ enabled: !enabled });
      await code.token().fill(value);
      await expect(code.token()).toHaveValue(value);
      await expect(code.submit()).toBeEnabled({ enabled });
    });
  }

  await test.step('seven digits typed: the field keeps six, Log in enabled', async () => {
    await code.token().fill('');
    await code.token().pressSequentially('1234567');
    await expect(code.token()).toHaveValue('123456');
    await expect(code.submit()).toBeEnabled();
  });
});

test('TC-TWOFACTOR-12 a code of the step before or after the current one signs in, and a code two steps away is refused @regression @security', async ({
  page,
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  test.slow();
  const { account, secret } = await aTwoFactorCustomer(actor);
  const anotherVisitor = await actor('anonymous');
  // Each code is made right before it is entered, in a step with enough left, so it is still the
  // same distance from the current step when the server reads it.
  const pairs: [string, typeof page, number, number][] = [
    ['before', page, -2, -1],
    ['after', anotherVisitor.page, 2, 1],
  ];

  for (const [side, visitor, far, near] of pairs) {
    await test.step(`${side}: ${far} steps refused, ${near} step signs in`, async () => {
      const code = new TwoFactorCodePage(visitor);
      await passwordStep(visitor, account);
      await code.enter(await freshTotp(secret, { ...STEP_MARGIN, offset: far }));
      await expect(code.invalid()).toBeVisible(ANSWER);
      expect(await new AccountApi(visitor.request).whoami()).toBeNull();

      await code.enter(await freshTotp(secret, { ...STEP_MARGIN, offset: near }));
      await expect(visitor).toHaveURL(/#\/search$/, ANSWER);
      expect(await new AccountApi(visitor.request).whoami()).toBe(account.username);
    });
  }
});

test('TC-TWOFACTOR-13 /#/2fa/enter opened without a pending login refuses <CODE> with the invalid-token message, and no session starts @regression @security', async ({
  page,
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  const { secret } = await aTwoFactorCustomer(actor);
  const code = new TwoFactorCodePage(page);

  await code.open();
  await expect(code.title()).toBeVisible();
  await code.enter(await freshTotp(secret));

  await expect(code.invalid()).toBeVisible(ANSWER);
  await expect(page).toHaveURL(/#\/2fa\/enter$/);
  expect(await new AccountApi(page.request).whoami()).toBeNull();
});

test('TC-TWOFACTOR-14 the code that signed in is refused for the next login, and the used pending-login token cannot complete another login @regression @security @known-gap', async ({
  page,
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  const { account, secret } = await aTwoFactorCustomer(actor);
  const code = new TwoFactorCodePage(page);
  // The page's client: the replays go out as from the same browser.
  const twoFactor = new TwoFactorApi(page.request);

  await passwordStep(page, account);
  const pending = (await browserStorage(page)).localStorage['totp_tmp_token'];
  if (!pending) throw new Error('The page keeps no pending-login token after the password.');
  rememberSecret(pending);
  // The replays must reach the server inside the step of the code they repeat. The token is
  // replayed with a code that is valid and was never used (the next step's), so only a token that
  // works once can refuse it; the used code is replayed on a new login of its own.
  const used = await freshTotp(secret, { marginMs: 20_000 });
  const unused = totp(secret, { offset: 1 });
  await code.enter(used);
  await expect(page).toHaveURL(/#\/search$/, ANSWER);
  const next = await twoFactor.pendingLogin(account);

  test.fail(true, await knownGap('LOCAL-63', 'a used code is accepted again'));
  await test.step('the used pending-login token with a fresh valid code is refused', async () => {
    expect.soft(await twoFactor.verify(pending, unused), 'the token again').toBe(false);
  });
  await test.step('a new login with the used code is refused', async () => {
    expect(await twoFactor.verify(next, used), 'the code again').toBe(false);
  });
});

test('TC-TWOFACTOR-15 after the code signs in, browser storage holds the session and no pending-login token @regression @security @known-gap', async ({
  page,
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  const { account, secret } = await aTwoFactorCustomer(actor);
  const code = new TwoFactorCodePage(page);

  await passwordStep(page, account);
  await code.enter(await freshTotp(secret));
  await expect(page).toHaveURL(/#\/search$/, ANSWER);
  // Polled: the page may write or clear its storage a moment after the move.
  const storedKeys = async () => {
    const { localStorage, sessionStorage } = await browserStorage(page);
    return [...Object.keys(localStorage), ...Object.keys(sessionStorage)];
  };
  await expect.poll(storedKeys, { message: 'the session in storage' }).toContain('token');

  test.fail(true, await knownGap('LOCAL-64', 'the pending-login token stays in local storage'));
  await expect
    .poll(storedKeys, { message: 'the pending-login token in storage' })
    .not.toContain('totp_tmp_token');
});

test('TC-TWOFACTOR-16 neither the password, the code nor the secret appears in the URL after the setup and after the sign-in @regression @security', async ({
  page,
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  const customer = await actor('customer', { fresh: true });
  if (!customer.account) throw new Error('A customer has an account.');
  const account = customer.account;
  const setup = new TwoFactorSetupPage(customer.page);
  const code = new TwoFactorCodePage(page);
  // What must not appear, as typed and as a URL would encode it. Failures name the label, never the
  // value.
  const secrets: { label: string; value: string }[] = [
    { label: 'the password', value: account.password },
  ];
  const leaked = (href: string) =>
    secrets
      .filter(({ value }) => href.includes(value) || href.includes(encodeURIComponent(value)))
      .map(({ label }) => label);

  await test.step('the setup through the page: nothing secret in its URL', async () => {
    const secret = await setup.openForSetup();
    const setupCode = await freshTotp(secret);
    secrets.push(
      { label: 'the secret', value: secret },
      { label: 'the setup code', value: setupCode },
    );
    await setup.setUp(account.password, setupCode);
    await expect(setup.enabled()).toBeVisible(ANSWER);
    await expect(customer.page).toHaveURL((url) => leaked(url.href).length === 0);
  });

  await test.step('the sign-in with a code: nothing secret in the URL on the way', async () => {
    const secret = secrets.find(({ label }) => label === 'the secret')!.value;
    await passwordStep(page, account);
    await expect(page).toHaveURL((url) => leaked(url.href).length === 0);
    const signInCode = await freshTotp(secret);
    secrets.push({ label: 'the sign-in code', value: signInCode });
    await code.enter(signInCode);
    await expect(page).toHaveURL(/#\/search$/, ANSWER);
    await expect(page).toHaveURL((url) => leaked(url.href).length === 0);
  });
});

test('TC-TWOFACTOR-20 the code form is filled and sent with the keyboard alone, the focus visible on each control in reading order @regression @a11y', async ({
  page,
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  const { account, secret } = await aTwoFactorCustomer(actor);
  const code = new TwoFactorCodePage(page);
  // As TC-LOGIN-07: Angular Material draws the focus on a wrapper, compared at rest and with focus
  // once the field holds a value.
  const focusIsVisible = async (control: Locator, region: Locator, name: string) =>
    expect(await focusChangesRendering(control, region), `focus visible on ${name}`).toBe(true);

  await passwordStep(page, account);
  await expect(code.title()).toBeVisible();

  await test.step('Tab from the top of the page to the code field', async () => {
    // The toolbar's buttons come first, and how many depends on the device's toolbar.
    await tabUntil(page, code.token(), 20);
    await expect(code.token()).toBeFocused();
  });

  await test.step('type the code: the focus visible on the field', async () => {
    // The rest of the case must reach the server inside the code's step.
    await page.keyboard.type(await freshTotp(secret, STEP_MARGIN));
    await focusIsVisible(code.token(), code.tokenField(), 'the code field');
    await code.token().focus();
  });

  await test.step('Tab to Log in and press Enter: signed in on /#/search', async () => {
    await page.keyboard.press('Tab');
    await expect(code.submit()).toBeFocused();
    await focusIsVisible(code.submit(), code.submit(), 'Log in');
    await code.submit().focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/search$/, ANSWER);
    expect(await new AccountApi(page.request).whoami()).toBe(account.username);
  });
});

test('TC-TWOFACTOR-21 the setup page, off and on, and /#/2fa/enter, waiting and refused, have no axe violation beyond the baseline @regression @a11y', async ({
  page,
  actor,
  a11y,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  const customer = await actor('customer', { fresh: true });
  if (!customer.account) throw new Error('A customer has an account.');
  const account = customer.account;
  const setup = new TwoFactorSetupPage(customer.page);
  const code = new TwoFactorCodePage(page);
  let secret = '';

  await test.step('the setup page with the setting off', async () => {
    secret = await setup.openForSetup();
    await a11y.expectNoNewViolations(customer.page);
  });

  await test.step('the setup page with the setting on', async () => {
    await setup.setUp(account.password, await freshTotp(secret));
    await expect(setup.enabled()).toBeVisible(ANSWER);
    await a11y.expectNoNewViolations(customer.page);
  });

  await test.step('the code page waiting for a code', async () => {
    await passwordStep(page, account);
    await expect(code.title()).toBeVisible();
    await a11y.expectNoNewViolations(page);
  });

  await test.step('the code page after a refused code', async () => {
    await code.enter(aWrongCode(secret));
    await expect(code.invalid()).toBeVisible(ANSWER);
    await a11y.expectNoNewViolations(page);
  });
});

test('TC-TWOFACTOR-23 a refused code is announced as an alert and marks the field invalid @regression @a11y @known-gap', async ({
  page,
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  const { account, secret } = await aTwoFactorCustomer(actor);
  const code = new TwoFactorCodePage(page);

  await passwordStep(page, account);
  await code.enter(aWrongCode(secret));
  await expect(code.invalid()).toBeVisible(ANSWER);

  test.fail(true, await knownGap('LOCAL-62', 'the invalid-token message is not announced'));
  await expect(code.invalidAlert(), 'the refusal as an alert').toBeVisible();
  await expect(code.token()).toHaveAttribute('aria-invalid', 'true');
});

test('TC-TWOFACTOR-25 neither page has horizontal scroll, in the off, on, waiting and refused states @regression @responsive', async ({
  page,
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  const customer = await actor('customer', { fresh: true });
  if (!customer.account) throw new Error('A customer has an account.');
  const account = customer.account;
  const setup = new TwoFactorSetupPage(customer.page);
  const code = new TwoFactorCodePage(page);
  // Polled: the shell measures a few pixels wider for a moment while the page settles.
  const settled = (on: typeof page, state: string) =>
    expect.poll(() => horizontalOverflow(on), { message: `sideways scroll ${state}` });

  const secret = await setup.openForSetup();
  await settled(customer.page, 'on the setup page, off').toBe(0);

  await setup.setUp(account.password, await freshTotp(secret));
  await expect(setup.enabled()).toBeVisible(ANSWER);
  await settled(customer.page, 'on the setup page, on').toBe(0);

  await passwordStep(page, account);
  await expect(code.title()).toBeVisible();
  await settled(page, 'on the code page, waiting').toBe(0);

  await code.enter(aWrongCode(secret));
  await expect(code.invalid()).toBeVisible(ANSWER);
  await settled(page, 'on the code page, refused').toBe(0);
});
