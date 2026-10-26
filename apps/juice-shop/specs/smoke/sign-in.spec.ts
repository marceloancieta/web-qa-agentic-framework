// Smoke of the harness: a customer starts signed in through the API on every device project, and
// the API client shares the page's session. These check the pack's actors, not a feature, so they
// carry no case id; the login form's own cases are TC-LOGIN-01 and -03 in specs/login/.

import { AccountApi } from '../../api/account-api';
import { AccountMenu } from '../../components/account-menu';
import { expect, test } from '../../fixtures';

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
