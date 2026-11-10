// Smoke: the Spree Commerce admin home page opens on every device project without page health problems.

import { HomePage } from '../../pages/home-page';
import { expect, test } from '../../fixtures';

test('the home page opens with a title @smoke', async ({ page }) => {
  await new HomePage(page).open();
  await expect(page).toHaveTitle(/\S/);
});
