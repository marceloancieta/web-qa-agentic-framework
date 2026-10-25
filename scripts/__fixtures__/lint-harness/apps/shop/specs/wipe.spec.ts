import { expect, test } from '../fixtures';

// A destructive case in a file of its own is what the lane expects.
test('wipes the catalog @regression @destructive', async ({ customer }) => {
  await customer.page.goto('/admin/wipe');
  await expect(customer.page).toHaveURL(/done/);
});
