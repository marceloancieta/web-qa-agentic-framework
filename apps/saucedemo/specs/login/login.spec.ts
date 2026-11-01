// Sign-in through the login form (registry/login.md). These are the cases about the form itself, so
// they type a password: the demo account's own, read from the environment through its actor, or one
// the run generated. Both are secrets the redaction reporter knows. The page starts signed out; a
// refused login reports the typed user name to a third party, which the pack blocks on every
// context (app.json third_party_hosts), so nothing leaves the run.

import {
  focusChangesRendering,
  focused,
  hasVisibleFocus,
  type FocusStop,
} from '../../../../helpers/keyboard';
import { knownGap } from '../../../../helpers/case-meta';
import { horizontalOverflow } from '../../../../helpers/layout';
import { browserStorage } from '../../../../helpers/storage';
import { anUnknownUser, aWrongPassword } from '../../builders/account-builder';
import { expect, test } from '../../fixtures';
import { InventoryPage } from '../../pages/inventory-page';
import { LoginPage } from '../../pages/login-page';

const SESSION_COOKIE = 'session-username';
// REQ-LOGIN-02, -03, -04 and -05: the messages of a refused login.
const USERNAME_REQUIRED = 'Epic sadface: Username is required';
const PASSWORD_REQUIRED = 'Epic sadface: Password is required';
const NO_MATCH = 'Epic sadface: Username and password do not match any user in this service';
const LOCKED_OUT = 'Epic sadface: Sorry, this user has been locked out.';
const onlyWhenSignedIn = (path: string) =>
  `Epic sadface: You can only access '${path}' when you are logged in.`;

test('TC-LOGIN-01 <STANDARD_USER> signs in through the form, lands on /inventory.html and sees the product list @smoke', async ({
  page,
  standard,
}) => {
  const account = standard.account!;
  const login = new LoginPage(page);
  const inventory = new InventoryPage(page);

  await login.open();
  await login.signIn(account.username, account.password);

  await expect(page).toHaveURL(/\/inventory\.html$/);
  await expect(inventory.list()).toBeVisible();
  const { cookies } = await browserStorage(page);
  expect(cookies[SESSION_COOKIE]).toBe(account.username);
});

test('TC-LOGIN-02 Login with both fields empty shows the alert "Epic sadface: Username is required", marks both fields and stays on / @regression', async ({
  page,
  qa,
}) => {
  const login = new LoginPage(page);
  await login.open();
  await expect(login.error()).toHaveCount(0);
  await expect(login.fieldsMarkedInError()).toHaveCount(0);

  await login.loginButton().click();

  await expect(login.error()).toHaveText(USERNAME_REQUIRED);
  await expect(login.fieldsMarkedInError()).toHaveCount(2);
  await expect(page).toHaveURL(`${qa.baseUrl}/`);
});

test('TC-LOGIN-03 Login with <STANDARD_USER> and an empty password shows "Epic sadface: Password is required" and stays on / @regression', async ({
  page,
  qa,
  standard,
}) => {
  const login = new LoginPage(page);
  await login.open();

  await login.signIn(standard.account!.username, '');

  await expect(login.error()).toHaveText(PASSWORD_REQUIRED);
  await expect(page).toHaveURL(`${qa.baseUrl}/`);
});

test('TC-LOGIN-04 <UNKNOWN_USER> with the accepted password and <STANDARD_USER> with <WRONG_PASSWORD> get the same message, "Epic sadface: Username and password do not match any user in this service", stay on / and get no session @regression @security', async ({
  page,
  qa,
  standard,
}) => {
  const account = standard.account!;
  const login = new LoginPage(page);

  await test.step('an unknown user name with the accepted password is refused', async () => {
    await login.open();
    await login.signIn(anUnknownUser(test.info().workerIndex), account.password);
    await expect(login.error()).toHaveText(NO_MATCH);
    await expect(page).toHaveURL(`${qa.baseUrl}/`);
  });

  await test.step('reload: no message, so the next one is new', async () => {
    await page.reload();
    await expect(login.loginButton()).toBeVisible();
    await expect(login.error()).toHaveCount(0);
  });

  await test.step('the accepted user name with a wrong password gets the same message', async () => {
    await login.signIn(account.username, aWrongPassword());
    await expect(login.error()).toHaveText(NO_MATCH);
    await expect(page).toHaveURL(`${qa.baseUrl}/`);
  });

  await test.step('no session started', async () => {
    const { cookies } = await browserStorage(page);
    expect(cookies[SESSION_COOKIE]).toBeUndefined();
  });
});

test('TC-LOGIN-05 <LOCKED_OUT_USER> with the accepted password is refused with "Epic sadface: Sorry, this user has been locked out.", stays on /, and /inventory.html then sends back to / @regression @security', async ({
  page,
  qa,
  actor,
}) => {
  // The actor is only where the locked-out account's credentials come from; the case types them
  // into a page of its own, signed out.
  const account = (await actor('locked-out')).account!;
  const login = new LoginPage(page);
  const inventory = new InventoryPage(page);

  await login.open();
  await login.signIn(account.username, account.password);
  await expect(login.error()).toHaveText(LOCKED_OUT);
  await expect(page).toHaveURL(`${qa.baseUrl}/`);

  await inventory.open();
  await expect(login.error()).toHaveText(onlyWhenSignedIn('/inventory.html'));
  await expect(page).toHaveURL(`${qa.baseUrl}/`);
  await expect(inventory.list()).toHaveCount(0);
});

test('TC-LOGIN-06 "Dismiss error" removes the alert and the error marks on both fields @regression', async ({
  page,
}) => {
  const login = new LoginPage(page);
  await login.open();
  await login.loginButton().click();
  await expect(login.error()).toBeVisible();
  await expect(login.fieldsMarkedInError()).toHaveCount(2);

  await login.dismissError();

  await expect(login.error()).toHaveCount(0);
  await expect(login.fieldsMarkedInError()).toHaveCount(0);
});

test('TC-LOGIN-07 the password field masks what is typed (type=password) @regression @security', async ({
  page,
}) => {
  const login = new LoginPage(page);
  await login.open();
  await expect(login.password()).toHaveAttribute('type', 'password');

  await login.password().fill(aWrongPassword());

  await expect(login.password()).toHaveAttribute('type', 'password');
});

test('TC-LOGIN-08 /inventory.html opened without a session sends the visitor to / with "Epic sadface: You can only access \'/inventory.html\' when you are logged in." @regression @security', async ({
  page,
  qa,
}) => {
  const login = new LoginPage(page);
  const inventory = new InventoryPage(page);

  await inventory.open();

  await expect(login.error()).toHaveText(onlyWhenSignedIn('/inventory.html'));
  await expect(page).toHaveURL(`${qa.baseUrl}/`);
  await expect(inventory.list()).toHaveCount(0);
});

test('TC-LOGIN-09 the form is filled and sent with the keyboard alone: Tab reaches Username, Password and Login in that order, each with a visible focus, and Enter signs in @regression @a11y @known-gap', async ({
  page,
  standard,
}) => {
  const account = standard.account!;
  const login = new LoginPage(page);
  const stops: FocusStop[] = [];
  const visible: Record<string, boolean> = {};

  await login.open();
  // Each control: Tab to it, see whether focus shows on it, then type into it.
  for (const [name, control, value] of [
    ['Username', login.username(), account.username],
    ['Password', login.password(), account.password],
    ['Login', login.loginButton(), null],
  ] as const) {
    await page.keyboard.press('Tab');
    stops.push(await focused(page));
    // The control's own style first, then the form's pixels, for an indicator drawn around it.
    visible[name] =
      (await hasVisibleFocus(control)) || (await focusChangesRendering(control, login.form()));
    if (value !== null) await page.keyboard.type(value);
  }

  expect(stops.map((stop) => stop.name)).toEqual(['Username', 'Password', 'Login']);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/inventory\.html$/);
  test.fail(true, await knownGap('LOCAL-26', 'no control shows a visible keyboard focus'));
  expect(visible).toEqual({ Username: true, Password: true, Login: true });
});

test('TC-LOGIN-10 Logout in the menu returns to /; Back and /inventory.html opened afterwards both lead to / again @regression @security @navigation', async ({
  qa,
  standard,
}) => {
  const { page } = standard;
  const login = new LoginPage(page);
  const inventory = new InventoryPage(page);
  await inventory.open();
  await expect(inventory.list()).toBeVisible();

  await test.step('Logout returns to the login page', async () => {
    await inventory.header.choose('Logout');
    await expect(page).toHaveURL(`${qa.baseUrl}/`);
    await expect(login.loginButton()).toBeVisible();
  });

  await test.step('Back reaches the list again and is sent to /', async () => {
    await page.goBack();
    // The message names the list, so Back did reach it and was refused there.
    await expect(login.error()).toHaveText(onlyWhenSignedIn('/inventory.html'));
    await expect(page).toHaveURL(`${qa.baseUrl}/`);
  });

  await test.step('the list opened afterwards in another tab is refused too', async () => {
    // The redirect's message rides on the history entry, and Chromium keeps it when the same URL is
    // opened again; a new tab of the same session starts without one, so the message it shows is
    // the list's own refusal.
    const later = await page.context().newPage();
    const laterLogin = new LoginPage(later);
    const laterInventory = new InventoryPage(later);
    await laterInventory.open();
    await expect(laterLogin.error()).toHaveText(onlyWhenSignedIn('/inventory.html'));
    await expect(later).toHaveURL(`${qa.baseUrl}/`);
    await expect(laterInventory.list()).toHaveCount(0);
  });
});

test('TC-LOGIN-11 neither the user name nor the password appears in the URL after a refused and after a successful login @regression @security', async ({
  page,
  standard,
}) => {
  const account = standard.account!;
  const wrong = aWrongPassword();
  const login = new LoginPage(page);
  const visited: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) visited.push(frame.url());
  });

  await login.open();
  await login.signIn(account.username, wrong);
  await expect(login.error()).toHaveText(NO_MATCH);
  await login.signIn(account.username, account.password);
  await expect(page).toHaveURL(/\/inventory\.html$/);

  expect(visited.length).toBeGreaterThan(1);
  for (const secret of [account.username, account.password, wrong]) {
    expect(visited.filter((url) => decodeURIComponent(url).includes(secret))).toEqual([]);
  }
});

test('TC-LOGIN-12 the login page has no horizontal scroll, in its initial and refused states @regression @responsive', async ({
  page,
}) => {
  const login = new LoginPage(page);
  await login.open();
  await expect(login.loginButton()).toBeVisible();
  await expect.poll(() => horizontalOverflow(page)).toBe(0);

  await login.loginButton().click();
  await expect(login.error()).toBeVisible();
  await expect.poll(() => horizontalOverflow(page)).toBe(0);
});

test('TC-LOGIN-13 the refusal is announced as an alert, and the page has no axe violation beyond the baseline before and after it @regression @a11y', async ({
  page,
  a11y,
}) => {
  const login = new LoginPage(page);
  await login.open();
  await expect(login.loginButton()).toBeVisible();
  await a11y.expectNoNewViolations(page);

  await login.loginButton().click();

  await expect(login.error()).toBeVisible();
  await expect(login.error()).toHaveText(USERNAME_REQUIRED);
  await a11y.expectNoNewViolations(page);
});
