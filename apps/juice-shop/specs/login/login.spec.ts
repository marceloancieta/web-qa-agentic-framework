// Sign-in through the login form (registry/login.md). These are the cases about the form itself, so
// they type a password: always one the run generated (`generatedPassword()` through the account
// builder), which the redaction reporter removes from the artifacts. The page starts signed out;
// the accounts a case registers are its own and stay until the container restarts. The API client
// is the page's own (`page.request`), so `whoami` reads the session the page holds.

import type { Locator } from '@playwright/test';
import { knownGap } from '../../../../helpers/case-meta';
import { focusChangesRendering, focused } from '../../../../helpers/keyboard';
import { browserStorage, storedText } from '../../../../helpers/storage';
import { loadDecisionTable } from '../../../../scripts/lib/decision-table.mjs';
import { AccountApi } from '../../api/account-api';
import { aCustomer } from '../../builders/account-builder';
import { AccountMenu } from '../../components/account-menu';
import { expect, test } from '../../fixtures';
import { LOGIN, loginFails } from '../../mocks/account-mocks';
import { LoginPage } from '../../pages/login-page';
import { generatedPassword, type Account } from '../../../../helpers/actors';

// REQ-LOGIN-02: the one message for an unknown email and a wrong password.
const REFUSAL = 'Invalid email or password.';
// The accessible name of the email field, as the focus helper reads it.
const EMAIL_FIELD = 'Text field for the login email';
// The first check after a submit waits for the login answer, which took 5.5 s on a local container
// busy with other runs (2026-10-26): longer than the default expect timeout, never a fixed wait.
const ANSWER = { timeout: 15_000 };

/** Register an account for the case alone, through the page's own API client. */
async function registeredAccount(api: AccountApi, prefix: string): Promise<Account> {
  const account = aCustomer(prefix, test.info().workerIndex);
  await api.register(account);
  return account;
}

test('TC-LOGIN-01 an account created for the run signs in through the form, lands on /#/search and the account menu shows <EMAIL> @smoke', async ({
  page,
  app,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case registers an account; allow_writes is false');
  const api = new AccountApi(page.request);
  const account = await registeredAccount(api, 'login-form');
  const login = new LoginPage(page);

  await login.open();
  await login.signIn(account.username, account.password);
  // The shop moves to its product search once the login has finished; the menu opened before that
  // would be the anonymous one.
  await expect(page).toHaveURL(/#\/search$/, ANSWER);

  const menu = AccountMenu.for(page, app);
  await menu.open();
  await expect(menu.account(account.username)).toBeVisible();
  // The session the page holds is the account's, as the server sees it.
  expect(await api.whoami()).toBe(account.username);
});

test('TC-LOGIN-03 a wrong password for <EMAIL> gets the same alert as an unknown email, and no session starts @regression @security', async ({
  page,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case registers an account; allow_writes is false');
  const api = new AccountApi(page.request);
  const account = await registeredAccount(api, 'login-wrong');
  // <UNKNOWN_EMAIL>: made unique by the builder and never registered.
  const unknown = aCustomer('login-unknown', test.info().workerIndex);
  const login = new LoginPage(page);

  await test.step('an unknown email gets the alert', async () => {
    await login.open();
    await login.signIn(unknown.username, unknown.password);
    await expect(login.alert()).toBeVisible(ANSWER);
    await expect(login.alert()).toHaveText(REFUSAL);
    await expect(page).toHaveURL(/#\/login$/);
  });

  await test.step('reload the login page: no alert, the form empty', async () => {
    // So the next alert cannot be the one the unknown email left on the page.
    await page.reload();
    await expect(login.submit()).toBeDisabled();
    await expect(login.alert()).toHaveCount(0);
  });

  await test.step('a wrong password for the account gets the same alert', async () => {
    // A second generated password: one the run knows, and not the account's.
    await login.signIn(account.username, generatedPassword());
    await expect(login.alert()).toBeVisible(ANSWER);
    await expect(login.alert()).toHaveText(REFUSAL);
    await expect(page).toHaveURL(/#\/login$/);
  });

  await test.step('no session started', async () => {
    expect(await api.whoami()).toBeNull();
  });
});

test('TC-LOGIN-04 Log in is enabled only when both fields have a value, walking every combination of rules/TC-LOGIN-04.yaml @regression @navigation', async ({
  page,
}) => {
  // Nothing is sent: the values only fill the form, so no account is needed.
  const filled = aCustomer('login-table', test.info().workerIndex);
  const value = { email: filled.username, password: filled.password };
  const login = new LoginPage(page);
  const fill = async (email: string, password: string) => {
    await login.email().fill(email);
    await login.password().fill(password);
    await expect(login.email()).toHaveValue(email);
    await expect(login.password()).toHaveValue(password);
  };

  await login.open();
  for (const { when, then } of loadDecisionTable('apps/juice-shop/rules/TC-LOGIN-04.yaml')) {
    const enabled = then['login'] === 'enabled';
    await test.step(`email ${when['email']}, password ${when['password']}: Log in ${then['login']}`, async () => {
      // Each combination is reached from the opposite state, so no check passes on the state the
      // step before it left.
      await fill(enabled ? '' : value.email, enabled ? '' : value.password);
      await expect(login.submit()).toBeEnabled({ enabled: !enabled });
      await fill(
        when['email'] === 'filled' ? value.email : '',
        when['password'] === 'filled' ? value.password : '',
      );
      await expect(login.submit()).toBeEnabled({ enabled });
    });
  }
});

test('TC-LOGIN-07 the form is filled and sent with the keyboard alone, the focus visible on each control in reading order @regression @a11y', async ({
  page,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case registers an account; allow_writes is false');
  const api = new AccountApi(page.request);
  const account = await registeredAccount(api, 'login-keys');
  const login = new LoginPage(page);
  // Angular Material draws the focus on a wrapper or a pseudo-element, not in the control's own
  // style, so the check compares how the region around the control is drawn at rest and with
  // focus. A text field is checked once it holds a value: empty, its label moves on focus, which
  // would change the picture whether or not a focus indicator is drawn.
  const focusIsVisible = async (control: Locator, region: Locator, name: string) =>
    expect(await focusChangesRendering(control, region), `focus visible on ${name}`).toBe(true);

  await login.open();
  // Log in is disabled with the fields empty, and out of the Tab order until both have a value.
  await expect(login.submit()).toBeDisabled();

  await test.step('Tab from the top of the page to the email field', async () => {
    // The toolbar's buttons come first, and how many depends on the device's toolbar.
    for (let presses = 0; presses < 15; presses += 1) {
      if ((await focused(page)).name === EMAIL_FIELD) break;
      await page.keyboard.press('Tab');
    }
    await expect(login.email()).toBeFocused();
  });

  await test.step('type the email, Tab to the password and type it', async () => {
    await page.keyboard.type(account.username);
    await focusIsVisible(login.email(), login.emailField(), 'the email field');
    await login.email().focus();
    await page.keyboard.press('Tab');
    await expect(login.password()).toBeFocused();
    await page.keyboard.type(account.password);
    await focusIsVisible(login.password(), login.passwordField(), 'the password field');
    await login.password().focus();
    await expect(login.email()).toHaveValue(account.username);
  });

  // The reading order of the form once both fields have a value: Log in has joined it.
  const order: [string, Locator][] = [
    ['Show password', login.showPassword()],
    ['Forgot your password?', login.forgotPassword()],
    ['Log in', login.submit()],
  ];
  for (const [name, control] of order) {
    await test.step(`Tab to ${name}`, async () => {
      await page.keyboard.press('Tab');
      await expect(control).toBeFocused();
      // A button or link has no label that moves: the control itself is the region.
      await focusIsVisible(control, control, name);
      await control.focus();
    });
  }

  await test.step('press Enter on Log in: signed in on /#/search', async () => {
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/search$/, ANSWER);
    expect(await api.whoami()).toBe(account.username);
  });
});

test('TC-LOGIN-12 neither the email nor the password appears in the URL or in browser storage after a refused and after a successful login @regression @security', async ({
  page,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case registers an account; allow_writes is false');
  const api = new AccountApi(page.request);
  const account = await registeredAccount(api, 'login-storage');
  const wrongPassword = generatedPassword();
  const login = new LoginPage(page);
  // What must not appear, as typed and as a URL would encode it. Failures name the label, never
  // the value, so neither storage nor a secret lands in the report.
  const typed = [
    { label: 'the email', value: account.username },
    { label: 'the password', value: account.password },
    { label: 'the wrong password', value: wrongPassword },
  ];
  const leaked = (text: string) =>
    typed
      .filter(({ value }) => text.includes(value) || text.includes(encodeURIComponent(value)))
      .map(({ label }) => label);

  await test.step('a refused login: the alert, and nothing typed in the URL or storage', async () => {
    await login.open();
    await login.signIn(account.username, wrongPassword);
    await expect(login.alert()).toHaveText(REFUSAL, ANSWER);
    await expect(page).toHaveURL(/#\/login$/);
    await expect(page).toHaveURL((url) => leaked(url.href).length === 0);
    expect(leaked(await storedText(page)), 'typed values found in browser storage').toEqual([]);
  });

  await test.step('a successful login: signed in, and nothing typed in the URL or storage', async () => {
    await login.signIn(account.username, account.password);
    await expect(page).toHaveURL(/#\/search$/, ANSWER);
    // The session is in the page's storage by now: whoami reads the page's token cookie.
    expect(await api.whoami()).toBe(account.username);
    await expect(page).toHaveURL((url) => leaked(url.href).length === 0);
    expect(leaked(await storedText(page)), 'typed values found in browser storage').toEqual([]);
  });
});

test.describe('a server error on the login', () => {
  // The mocked 500 is what the case is about; the guard keeps watching everything else.
  test.use({ pageHealth: { allowRequests: [LOGIN] } });

  test('TC-LOGIN-15 a server error on the login keeps the visitor on /#/login with a message and no session @regression @mocked @known-gap', async ({
    page,
    app,
  }) => {
    // <UNKNOWN_EMAIL>: the mocked answer comes before the server, so nothing is registered or sent.
    const visitor = aCustomer('login-500', test.info().workerIndex);
    const login = new LoginPage(page);

    await login.open();
    await loginFails(page);
    await login.signIn(visitor.username, visitor.password);
    // The alert is the sign the answer arrived; the checks after it cannot pass before it did.
    await expect(login.anyAlert()).toBeVisible(ANSWER);
    await expect(page).toHaveURL(/#\/login$/);
    // The mocked answer never reaches the server, so the session to check is the page's own: a
    // page that took the 500 for a sign-in would show the account, not the way to the login.
    const kept = await browserStorage(page);
    expect(kept.localStorage.token, 'no token in local storage').toBeUndefined();
    expect(kept.cookies.token, 'no token cookie').toBeUndefined();
    const menu = AccountMenu.for(page, app);
    await menu.open();
    await expect(menu.login()).toBeVisible();

    test.fail(
      true,
      await knownGap(
        'LOCAL-19',
        'the alert after a server error on the login reads "[object Object]"',
      ),
    );
    // A message a person can read: not empty and not the raw error object.
    await expect(login.anyAlert()).not.toHaveText(/^\s*$|\[object \w+\]/);
  });
});
