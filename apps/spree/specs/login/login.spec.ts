// Sign-in to the Spree admin dashboard through its form (registry/login.md). The page starts signed
// out. A case that needs an account makes a `staff` member of its own (`actor('staff', { fresh:
// true })`), removed when the worker ends, so the shared admin is never locked out or signed out;
// passwords come from `generatedPassword()`, which the redaction reporter knows. The API client is
// the page's own (`page.request`), so `whoami` reads the session the page holds.

import type { Page } from '@playwright/test';
import { generatedPassword } from '../../../../helpers/actors';
import { knownGap } from '../../../../helpers/case-meta';
import { hasVisibleFocus } from '../../../../helpers/keyboard';
import { horizontalOverflow, unloadedImages } from '../../../../helpers/layout';
import { storedText } from '../../../../helpers/storage';
import { becomesVisibleWithin } from '../../../../helpers/watch';
import { AuthApi } from '../../api/auth-api';
import { anUnknownEmail, staffName } from '../../builders/staff-builder';
import { UserMenu } from '../../components/user-menu';
import { ABORTED_FONT_DOWNLOAD, expect, test, type Actor } from '../../fixtures';
import { slowSignIn, watchSignIns } from '../../mocks/auth-mocks';
import { LoginPage } from '../../pages/login-page';
import { SectionPage, openDashboard, storeIdOf } from '../../pages/section-page';

// REQ-LOGIN-02 to 04 and 06: the messages the page shows.
const REFUSAL = 'Invalid email or password';
const LOCKED = 'Account temporarily locked. Try again later.';
const EMAIL_MESSAGE = 'Invalid email address';
const PASSWORD_MESSAGE = 'Password is required';
// The failed attempts that lock an account (REQ-LOGIN-06, Spree's max_failed_login_attempts).
const LOCK_AFTER = 5;
// A sign-in answer took up to a few seconds on a local container busy with parallel workers.
const ANSWER = { timeout: 15_000 };

test.use({ pageHealth: { allowConsole: [ABORTED_FONT_DOWNLOAD] } });
const ON_LOGIN = /\/dashboard\/login$/;
// How long a watch waits for data that must not show: longer than a redirect takes.
const SHOWN_WITHIN = 5_000;
const ON_STORE = /\/dashboard\/store_[^/]+\/?$/;

type ActorOf = (role: string, options: { fresh: true }) => Promise<Actor>;

/** A staff member of the case's own, created through the admin API and signed in. */
async function staffMember(actor: ActorOf, qa: { allowWrites: boolean }): Promise<Actor> {
  test.skip(!qa.allowWrites, 'the case creates a staff member; allow_writes is false');
  return actor('staff', { fresh: true });
}

/** The account of a staff member of the case's own. */
async function ownStaff(actor: ActorOf, qa: { allowWrites: boolean }) {
  const { account } = await staffMember(actor, qa);
  if (!account) throw new Error('A staff actor has an account.');
  return account;
}

/** Send `times` refused sign-ins for `email`, each one answered before the next. */
async function failSignIns(page: Page, login: LoginPage, email: string, times: number) {
  // Five sign-ins answered one after the other take longer than one page's case on WebKit.
  test.slow();
  const signIns = watchSignIns(page);
  for (let attempt = 1; attempt <= times; attempt += 1) {
    await login.signIn(email, generatedPassword());
    await expect.poll(() => signIns.sent(), ANSWER).toBe(attempt);
    // "Sign in" reads again once the answer has come back.
    await expect(login.submit()).toBeEnabled(ANSWER);
  }
}

test('TC-LOGIN-01 a staff account created for the case signs in through the form, lands on /dashboard/<STORE_ID> with the heading "Dashboard", and the user menu shows its name @smoke', async ({
  page,
  actor,
  qa,
}) => {
  const account = await ownStaff(actor, qa);
  const login = new LoginPage(page);
  const { first, last } = staffName(account);

  await login.open();
  await login.signIn(account.username, account.password);

  await expect(page).toHaveURL(ON_STORE, ANSWER);
  await expect(new SectionPage(page, storeIdOf(page.url())).heading('Dashboard')).toBeVisible();
  const menu = new UserMenu(page);
  await menu.open();
  await expect(menu.menu()).toContainText(`${first} ${last}`);
  // The session the page holds is the member's, as the server sees it.
  expect(await new AuthApi(page.request).whoami()).toBe(account.username);
});

test('TC-LOGIN-02 "Sign in" with both fields empty shows "Invalid email address" under Email and "Password is required" under Password, marks both fields invalid and sends no sign-in request @regression', async ({
  page,
}) => {
  const login = new LoginPage(page);
  const signIns = watchSignIns(page);
  await login.open();
  await expect(login.email()).not.toHaveAttribute('aria-invalid', 'true');

  await login.submit().click();

  await expect(login.fieldMessage(login.email(), login.password(), EMAIL_MESSAGE)).toBeVisible();
  await expect(login.fieldMessage(login.password(), login.email(), PASSWORD_MESSAGE)).toBeVisible();
  await expect(login.email()).toHaveAttribute('aria-invalid', 'true');
  await expect(login.password()).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(ON_LOGIN);
  expect(signIns.sent()).toBe(0);
});

test("TC-LOGIN-03 an email without the shape of an address (no `@`, nothing after the `@`, nothing before it) is reported invalid by the browser's own check of the Email field, and no sign-in request is sent @regression", async ({
  page,
}) => {
  const login = new LoginPage(page);
  const signIns = watchSignIns(page);
  for (const email of ['qa-member', 'qa-member@', '@example.test']) {
    await test.step(`"${email}" is stopped by the browser's check`, async () => {
      await login.open();
      await login.email().fill(email);
      await expect(login.refusedByBrowser(login.email())).toBeVisible();
      await login.password().fill(generatedPassword());
      await login.submit().click();
      // The browser keeps the form from submitting: the page stays, with no message of its own.
      await expect(page).toHaveURL(ON_LOGIN);
      await expect(login.submit()).toBeEnabled();
      await expect(login.message(EMAIL_MESSAGE)).toHaveCount(0);
    });
  }
  await test.step('a well-formed address passes the same check', async () => {
    await login.email().fill(anUnknownEmail(test.info().workerIndex));
    await expect(login.refusedByBrowser(login.email())).toHaveCount(0);
  });
  expect(signIns.sent()).toBe(0);
});

test('TC-LOGIN-04 <UNKNOWN_EMAIL> and a wrong password for <STAFF_EMAIL> both get "Invalid email or password", and the page stays on /dashboard/login @regression @security', async ({
  page,
  actor,
  qa,
}) => {
  const account = await ownStaff(actor, qa);
  const login = new LoginPage(page);

  await test.step('an unknown email gets the refusal', async () => {
    await login.open();
    await login.signIn(anUnknownEmail(test.info().workerIndex), generatedPassword());
    await expect(login.message(REFUSAL)).toBeVisible(ANSWER);
    await expect(page).toHaveURL(ON_LOGIN);
  });
  await test.step('a wrong password for the member gets the same refusal', async () => {
    await login.open();
    await expect(login.message(REFUSAL)).toHaveCount(0);
    await login.signIn(account.username, generatedPassword());
    await expect(login.message(REFUSAL)).toBeVisible(ANSWER);
    await expect(page).toHaveURL(ON_LOGIN);
  });
  expect(await new AuthApi(page.request).whoami()).toBeNull();
});

test('TC-LOGIN-05 while a delayed sign-in answer is on its way, "Sign in" reads "Signing in…" and is disabled; when it arrives, the dashboard opens @regression @perf', async ({
  page,
  actor,
  qa,
}) => {
  const account = await ownStaff(actor, qa);
  const login = new LoginPage(page);
  await slowSignIn(page, 3_000);
  await login.open();

  await login.signIn(account.username, account.password);

  await expect(login.waiting()).toBeVisible();
  await expect(login.waiting()).toBeDisabled();
  await expect(page).toHaveURL(ON_STORE, ANSWER);
  await expect(login.waiting()).toHaveCount(0);
});

test('TC-LOGIN-06 after five wrong passwords for <STAFF_EMAIL>, its right password gets "Account temporarily locked. Try again later." and the page stays on /dashboard/login @regression @security', async ({
  page,
  actor,
  qa,
}) => {
  const account = await ownStaff(actor, qa);
  const login = new LoginPage(page);
  await login.open();
  await failSignIns(page, login, account.username, LOCK_AFTER);
  await expect(login.message(LOCKED)).toHaveCount(0);

  await login.signIn(account.username, account.password);

  await expect(login.message(LOCKED)).toBeVisible(ANSWER);
  await expect(page).toHaveURL(ON_LOGIN);
  expect(await new AuthApi(page.request).whoami()).toBeNull();
});

test('TC-LOGIN-07 after four wrong passwords for <STAFF_EMAIL>, its right password still signs in @regression @security', async ({
  page,
  actor,
  qa,
}) => {
  const account = await ownStaff(actor, qa);
  const login = new LoginPage(page);
  await login.open();
  await failSignIns(page, login, account.username, LOCK_AFTER - 1);

  await login.signIn(account.username, account.password);

  await expect(page).toHaveURL(ON_STORE, ANSWER);
  expect(await new AuthApi(page.request).whoami()).toBe(account.username);
});

test("TC-LOGIN-08 after five wrong passwords for <UNKNOWN_EMAIL>, a sixth gets the same message as a locked account's, so the message does not tell which emails have an account @regression @security @known-gap", async ({
  page,
}) => {
  const unknown = anUnknownEmail(test.info().workerIndex);
  const login = new LoginPage(page);
  await login.open();
  await failSignIns(page, login, unknown, LOCK_AFTER);
  test.fail(true, await knownGap('LOCAL-50', 'an unknown email never gets the lockout message'));

  await login.signIn(unknown, generatedPassword());

  await expect(login.message(LOCKED)).toBeVisible(ANSWER);
});

test('TC-LOGIN-09 the password is masked while typed: Password has `type=password` and its value is not shown @regression @security', async ({
  page,
}) => {
  // Nothing is sent: the value only fills the field.
  const typed = generatedPassword();
  const login = new LoginPage(page);
  await login.open();

  await login.password().fill(typed);

  await expect(login.password()).toHaveAttribute('type', 'password');
  await expect(login.password()).toHaveValue(typed);
  await expect(login.message(typed)).toHaveCount(0);
});

test('TC-LOGIN-10 without a session, /dashboard, /dashboard/<STORE_ID>/orders and /dashboard/<STORE_ID>/settings/staff each lead to /dashboard/login and show none of their data @regression @security', async ({
  page,
  admin,
}) => {
  // The store's id, from the admin's own landing page.
  const { storeId } = await openDashboard(admin.page);
  const login = new LoginPage(page);
  const section = new SectionPage(page, storeId);
  for (const path of ['', 'orders', 'settings/staff']) {
    await test.step(`/dashboard/${path ? '<STORE_ID>/' + path : ''} leads to the login`, async () => {
      // Watched from before the visit: rows drawn for a moment before the move to the login count.
      const shown = becomesVisibleWithin(section.records(), SHOWN_WITHIN);
      if (path) await section.open(path);
      else await page.goto('dashboard');
      await expect(page).toHaveURL(ON_LOGIN, ANSWER);
      await expect(login.heading()).toBeVisible();
      expect(await shown, 'records shown without a session').toBe(false);
    });
  }
});

test('TC-LOGIN-11 "Log out" in the user menu moves to /dashboard/login, and /dashboard/<STORE_ID>/orders opened afterwards leads to the login again @regression @security', async ({
  actor,
  qa,
}) => {
  const staff = await staffMember(actor, qa);
  const { page } = staff;
  const home = await openDashboard(page);
  await expect(home.heading('Dashboard')).toBeVisible();

  await new UserMenu(page).signOut();

  await expect(page).toHaveURL(ON_LOGIN, ANSWER);
  await home.open('orders');
  await expect(page).toHaveURL(ON_LOGIN, ANSWER);
  await expect(new LoginPage(page).heading()).toBeVisible();
  expect(await new AuthApi(page.request).whoami()).toBeNull();
});

test('TC-LOGIN-12 Back after "Log out", from a dashboard reached through two pages, shows no dashboard data and leaves the visitor signed out @regression @navigation', async ({
  actor,
  qa,
}) => {
  const staff = await staffMember(actor, qa);
  const { page } = staff;
  const home = await openDashboard(page);
  await home.open('orders');
  await expect(home.record('#R1001')).toBeVisible();
  await new UserMenu(page).signOut();
  await expect(page).toHaveURL(ON_LOGIN, ANSWER);

  // Watched from before Back: orders drawn from memory before the move to the login count.
  const shown = becomesVisibleWithin(home.record('#R1001'), SHOWN_WITHIN);

  await page.goBack();

  await expect(page).toHaveURL(ON_LOGIN, ANSWER);
  await expect(new LoginPage(page).heading()).toBeVisible();
  expect(await shown, 'orders shown after Back').toBe(false);
  expect(await new AuthApi(page.request).whoami()).toBeNull();
});

test('TC-LOGIN-13 Email has the focus when the page opens, Tab reaches Password, "Sign in" and "Forgot password?" in that order with a visible focus, and Enter in Password signs in @regression @a11y @not-webkit', async ({
  page,
  actor,
  qa,
}) => {
  const account = await ownStaff(actor, qa);
  const login = new LoginPage(page);
  await login.open();
  await expect(login.email()).toBeFocused();
  await page.keyboard.type(account.username);
  expect(await hasVisibleFocus(login.email()), 'focus visible on Email').toBe(true);

  const order = [
    ['Password', login.password()],
    ['Sign in', login.submit()],
    ['Forgot password?', login.forgotPassword()],
  ] as const;
  for (const [name, control] of order) {
    await test.step(`Tab to ${name}`, async () => {
      await page.keyboard.press('Tab');
      await expect(control).toBeFocused();
      if (name === 'Password') await page.keyboard.type(account.password);
      expect(await hasVisibleFocus(control), `focus visible on ${name}`).toBe(true);
    });
  }

  await test.step('Enter in Password signs in', async () => {
    await login.password().focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(ON_STORE, ANSWER);
  });
});

test('TC-LOGIN-14 neither the email nor the password appears in the URL or in browser storage, after a refused and after a successful sign-in @regression @security', async ({
  page,
  actor,
  qa,
}) => {
  const account = await ownStaff(actor, qa);
  const wrong = generatedPassword();
  const login = new LoginPage(page);
  // What must not appear, as typed and as a URL would encode it. Failures name the label, never
  // the value.
  const typed = [
    { label: 'the email', value: account.username },
    { label: 'the password', value: account.password },
    { label: 'the wrong password', value: wrong },
  ];
  const leaked = (text: string) =>
    typed
      .filter(({ value }) => text.includes(value) || text.includes(encodeURIComponent(value)))
      .map(({ label }) => label);

  await test.step('a refused sign-in leaves nothing typed in the URL or storage', async () => {
    await login.open();
    await login.signIn(account.username, wrong);
    await expect(login.message(REFUSAL)).toBeVisible(ANSWER);
    await expect(page).toHaveURL((url) => leaked(url.href).length === 0);
    expect(leaked(await storedText(page)), 'typed values found in browser storage').toEqual([]);
  });
  await test.step('a successful sign-in leaves nothing typed in the URL or storage', async () => {
    await login.signIn(account.username, account.password);
    await expect(page).toHaveURL(ON_STORE, ANSWER);
    // The dashboard has loaded the member (the user menu) before storage is read.
    await expect(new SectionPage(page, storeIdOf(page.url())).heading('Dashboard')).toBeVisible();
    await expect(new UserMenu(page).button()).toBeVisible();
    await expect(page).toHaveURL((url) => leaked(url.href).length === 0);
    expect(leaked(await storedText(page)), 'typed values found in browser storage').toEqual([]);
  });
});

test('TC-LOGIN-15 a signed-in staff member who reloads /dashboard/<STORE_ID> stays signed in on the same page @regression @navigation', async ({
  admin,
}) => {
  const { page, account } = admin;
  const home = await openDashboard(page);
  await expect(home.heading('Dashboard')).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(home.url());
  await expect(home.heading('Dashboard')).toBeVisible();
  // Compared, never printed: the admin's address comes from the environment.
  const member = await new AuthApi(page.request).whoami();
  expect(member === account?.username, "the page still holds the admin's session").toBe(true);
});

test('TC-LOGIN-16 the login page has no horizontal scroll, in its initial, invalid and refused states @regression @responsive', async ({
  page,
}) => {
  const login = new LoginPage(page);
  await login.open();
  await expect(login.heading()).toBeVisible();
  await expect.poll(() => horizontalOverflow(page), { message: 'initial' }).toBe(0);

  await login.submit().click();
  await expect(login.message(EMAIL_MESSAGE)).toBeVisible();
  await expect.poll(() => horizontalOverflow(page), { message: 'invalid' }).toBe(0);

  await login.signIn(anUnknownEmail(test.info().workerIndex), generatedPassword());
  await expect(login.message(REFUSAL)).toBeVisible(ANSWER);
  await expect.poll(() => horizontalOverflow(page), { message: 'refused' }).toBe(0);
});

test('TC-LOGIN-17 the login page loads with no broken image, failed request, console error or uncaught exception, and the same after a refused sign-in @regression @layout', async ({
  page,
}) => {
  // The page health guard checks the requests, the console and the exceptions when the case ends.
  const login = new LoginPage(page);
  await login.open();
  await expect(login.heading()).toBeVisible();
  await expect.poll(() => unloadedImages(login.images()), { message: 'initial' }).toEqual([]);

  await login.signIn(anUnknownEmail(test.info().workerIndex), generatedPassword());

  await expect(login.message(REFUSAL)).toBeVisible(ANSWER);
  await expect.poll(() => unloadedImages(login.images()), { message: 'refused' }).toEqual([]);
});

test('TC-LOGIN-18 the login page, in its initial, invalid and refused states, has no axe violation beyond the baseline @regression @a11y', async ({
  page,
  a11y,
}) => {
  const login = new LoginPage(page);
  await test.step('initial', async () => {
    await login.open();
    await expect(login.heading()).toBeVisible();
    await a11y.expectNoNewViolations(page);
  });
  await test.step('invalid', async () => {
    await login.submit().click();
    await expect(login.message(PASSWORD_MESSAGE)).toBeVisible();
    await a11y.expectNoNewViolations(page);
  });
  await test.step('refused', async () => {
    await login.signIn(anUnknownEmail(test.info().workerIndex), generatedPassword());
    await expect(login.message(REFUSAL)).toBeVisible(ANSWER);
    await a11y.expectNoNewViolations(page);
  });
});

test('TC-LOGIN-19 the refusal message is announced (an `alert` or `status` role, or a live region) and each field message is tied to its field through `aria-describedby` @regression @a11y @known-gap', async ({
  page,
}) => {
  const login = new LoginPage(page);
  await login.open();
  await login.signIn(anUnknownEmail(test.info().workerIndex), generatedPassword());
  await expect(login.message(REFUSAL)).toBeVisible(ANSWER);
  test.fail(
    true,
    await knownGap('LOCAL-45', 'the login messages are plain paragraphs, outside any live region'),
  );

  // Soft, so both claims are read: the refusal's announcement, then the field messages' ties.
  await expect.soft(login.announcement(REFUSAL)).toBeVisible();
  await login.email().fill('');
  await login.password().fill('');
  await login.submit().click();
  // The field messages themselves are TC-LOGIN-02's, which runs unarmed.
  await expect(login.message(EMAIL_MESSAGE)).toBeVisible();
  await expect.soft(login.email()).toHaveAccessibleDescription(EMAIL_MESSAGE);
  await expect.soft(login.password()).toHaveAccessibleDescription(PASSWORD_MESSAGE);
});

test('TC-LOGIN-20 Email declares its purpose (`autocomplete` `email` or `username`), Password declares `current-password`, and both are exposed as required @regression @a11y @known-gap', async ({
  page,
}) => {
  const login = new LoginPage(page);
  await login.open();
  await expect(login.email()).toBeVisible();
  test.fail(
    true,
    await knownGap('LOCAL-46', 'the sign-in fields carry no autocomplete or required'),
  );

  await expect(login.email()).toHaveAttribute('autocomplete', /^(email|username)$/);
  await expect(login.password()).toHaveAttribute('autocomplete', 'current-password');
  await expect(login.required(login.email())).toBeVisible();
  await expect(login.required(login.password())).toBeVisible();
});
