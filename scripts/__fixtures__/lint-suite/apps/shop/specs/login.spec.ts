import { expect, test } from '../fixtures';

test('TC-LOGIN-01 signs in with a fresh account @smoke @security', async ({ customer }) => {
  await expect(customer.page).toHaveURL(/search/);
});

test('TC-LOGIN-02 a wrong password is refused generically @regression', async ({ page }) => { // expect-finding: tags-mismatch
  await expect(page).toHaveURL(/login/);
});

test.describe('on phones @regression @navigation @mobile-only', () => {
  test('TC-LOGIN-05 the hamburger opens the account', async ({ customer }) => {
    await expect(customer.page).toHaveURL(/search/);
  });
});

test('TC-LOGIN-99 a case nobody designed @regression', async ({ page }) => { // expect-finding: spec-without-case
  await expect(page).toHaveURL(/login/);
});

test('a smoke without a case id is not a designed case @smoke', async ({ page }) => {
  await expect(page).toHaveTitle(/Shop/);
});
