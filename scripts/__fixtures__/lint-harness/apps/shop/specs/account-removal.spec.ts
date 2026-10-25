import { expect, test } from '../fixtures';

test('deletes the account @regression @destructive', async ({ customer }) => { // expect-finding: destructive-isolation
  await customer.page.goto('/account/delete');
  await expect(customer.page).toHaveURL(/goodbye/);
});

test('shows the account @regression', async ({ customer }) => {
  await customer.page.goto('/account');
  await expect(customer.page).toHaveTitle(/Account/);
});
