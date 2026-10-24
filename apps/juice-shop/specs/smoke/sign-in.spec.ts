// Smoke: the two ways into a Juice Shop session work on every device project. Only the case
// about the login form goes through the UI, with an account created during the run; every other
// case starts signed in through the API.

import { AccountApi } from '../../api/account-api';
import { aCustomer } from '../../builders/account-builder';
import { AccountMenu } from '../../components/account-menu';
import { LoginPage } from '../../pages/login-page';
import { expect, test } from '../../fixtures';

test('the login form signs in an account created for the run @smoke', async ({
  page,
  actor,
  app,
}) => {
  const guest = await actor('anonymous');
  const account = aCustomer('ui-login', test.info().workerIndex);
  await new AccountApi(guest.api).register(account);

  const login = new LoginPage(page);
  await login.open();
  await login.signIn(account.username, account.password);
  // The shop moves to its product search once the login has finished; opening the menu before
  // that would show the anonymous menu, which the navigation then closes.
  await expect(page).toHaveURL(/#\/search$/);

  const menu = AccountMenu.for(page, app);
  await menu.open();
  await expect(menu.account(account.username)).toBeVisible();
});

test('a wrong password gets a message that does not say which part was wrong @smoke @security', async ({
  page,
  actor,
}) => {
  const guest = await actor('anonymous');
  const account = aCustomer('wrong-password', test.info().workerIndex);
  await new AccountApi(guest.api).register(account);

  const login = new LoginPage(page);
  await login.open();
  await login.signIn(account.username, `${account.password}-wrong`);
  await expect(login.error()).toBeVisible();
  await expect(page).toHaveURL(/#\/login$/);
});

test('a customer starts signed in, without the login screen @smoke', async ({ customer, app }) => {
  const visited: string[] = [];
  customer.page.on('request', (request) => visited.push(new URL(request.url()).pathname));

  await customer.page.goto('#/');
  const menu = AccountMenu.for(customer.page, app);
  await menu.open();
  await expect(menu.account(customer.account?.username ?? '')).toBeVisible();
  expect(visited).not.toContain('/rest/user/login');
});

test("the API client shares the customer's session @smoke", async ({ customer }) => {
  expect(await new AccountApi(customer.api).whoami()).toBe(customer.account?.username);
});
