// Smoke of the harness: the standard actor starts signed in on every device project, without the
// login form. It checks the pack's actor, not a feature, so it carries no case id; the login form's
// own cases come with the login registry.

import { InventoryPage } from '../../pages/inventory-page';
import { expect, test } from '../../fixtures';

test('the standard actor starts signed in, without the login form @smoke', async ({ standard }) => {
  const inventory = new InventoryPage(standard.page);
  await inventory.open();
  await expect(inventory.list()).toBeVisible();
  await expect(standard.page).toHaveURL(/\/inventory\.html$/);
});
