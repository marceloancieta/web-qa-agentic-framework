import { expect, test } from '../../fixtures';
import { CartPage } from '../../pages/cart-page';
import { emptyCatalog } from '../../mocks/catalog';

test('the cart shows the added product @smoke', async ({ page, customer }) => {
  const cart = new CartPage(page);
  await customer.api.addToBasket('apple-juice');
  await cart.open();
  await expect(cart.row('Apple Juice')).toBeVisible();
  await expect(cart.total()).toHaveText('1.99');
});

test('a product row is found by the spec itself', async ({ page }) => {
  const cart = new CartPage(page);
  await cart.open();
  await page.locator('#cart .row').first().click(); // expect-finding: spec-builds-locator
  await expect(page.getByRole('button', { name: 'Checkout' })).toBeEnabled(); // expect-finding: spec-builds-locator
  await expect(cart.row('Apple Juice').getByText('1.99')).toBeVisible(); // expect-finding: spec-builds-locator
  const count = await page.$$eval('.row', (rows) => rows.length); // expect-finding: spec-builds-locator
  expect(count).toBe(1);
});

test('an empty catalog through the pack mocks', async ({ page }) => {
  await emptyCatalog(page);
  const cart = new CartPage(page);
  await cart.open();
  // The words locator, route and fetch in a comment or a 'locator string' are not calls.
  await expect(cart.emptyMessage()).toHaveText('Your basket is empty');
});

test('setting up a mock in the spec', async ({ page }) => {
  await page.route('**/rest/products', (route) => route.fulfill({ json: [] })); // expect-finding: spec-routes-network
  await page.context().routeFromHAR('catalog.har'); // expect-finding: spec-routes-network
  await page.unroute('**/rest/products'); // expect-finding: spec-routes-network
});
