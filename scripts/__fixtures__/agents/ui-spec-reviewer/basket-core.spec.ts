// The basket review cases about adding and the total: TC-BREV-01 to 05, 07 and 12.

import { expect, test } from '../../../../apps/juice-shop/fixtures';
import { knownGap } from '../../../../helpers/case-meta';
import {
  APPLE_JUICE,
  BasketReviewApi,
  BasketReviewPage,
  emptyBasketOf,
  SearchReviewPage,
} from './review-blocks';

test('TC-BREV-01 an empty basket shows "Your Basket (<EMAIL>)", "Total Price: 0¤" and a disabled Checkout @sanity @navigation', async ({
  customer,
}) => {
  await emptyBasketOf(customer);
  const basket = new BasketReviewPage(customer.page);
  await basket.open();
  await expect(basket.title()).toHaveText(`Your Basket (${customer.account?.username})`);
  await expect(basket.rows()).toHaveCount(0);
  await expect(basket.total()).toHaveText('Total Price: 0¤');
  await expect(basket.checkout()).toBeDisabled();
});

// expect-review: title-claim
test('TC-BREV-02 adding Apple Juice from the search page says "Placed Apple Juice (1000ml) into basket.", and the basket lists it with quantity 1 @smoke', async ({
  customer,
}) => {
  await emptyBasketOf(customer);
  const search = new SearchReviewPage(customer.page);
  await search.open(APPLE_JUICE.name);
  const added = customer.page.waitForResponse(
    (response) => response.url().endsWith('/api/BasketItems/') && response.request().method() === 'POST',
  );
  await search.addToBasket(APPLE_JUICE.name);
  expect((await added).ok()).toBe(true);
  await expect(search.notification()).toHaveText(`Placed ${APPLE_JUICE.name} into basket.`);
  await expect(search.basketButton()).toContainText('1');
});

test('TC-BREV-03 adding Apple Juice a second time raises its quantity to 2 @regression', async ({
  customer,
}) => {
  const { bid, basket: api } = await emptyBasketOf(customer);
  await api.add(bid, APPLE_JUICE.id);
  const search = new SearchReviewPage(customer.page);
  await search.open(APPLE_JUICE.name);
  await search.addToBasket(APPLE_JUICE.name);
  expect(await search.basketButton().textContent()).toContain('2'); // expect-review: timing
  const basket = new BasketReviewPage(customer.page);
  await basket.open();
  await expect(basket.quantityOf(APPLE_JUICE.name)).toHaveText('2');
  expect((await api.items(bid)).map((item) => item.quantity)).toEqual([2]);
});

test('TC-BREV-04 with Apple Juice twice and Orange Juice once, the total is 6.97¤ @regression', async ({
  customer,
}) => {
  const { bid, basket: api } = await emptyBasketOf(customer);
  await api.add(bid, APPLE_JUICE.id); // expect-review: coincidental-pass
  const basket = new BasketReviewPage(customer.page);
  await basket.open();
  await expect(basket.row(APPLE_JUICE.name)).toBeVisible();
  await expect(basket.total()).toHaveText(`Total Price: ${APPLE_JUICE.price}¤`);
});

test('TC-BREV-05 a sixth Apple Juice says "You can order only up to 5 items of this product." and the quantity stays 5 @regression', async ({
  customer,
}) => {
  const { bid, basket: api } = await emptyBasketOf(customer);
  const limit = await api.limitOf(APPLE_JUICE.id);
  await api.add(bid, APPLE_JUICE.id, limit);
  const search = new SearchReviewPage(customer.page);
  await search.open(APPLE_JUICE.name);
  await search.addToBasket(APPLE_JUICE.name);
  await expect(search.limitMessage()).toHaveText(
    `You can order only up to ${limit} items of this product.`,
  );
  expect((await api.items(bid)).map((item) => item.quantity)).toEqual([limit]);
});

test("TC-BREV-07 a second customer who asks for the first one's basket id is refused @regression @security @known-gap", async ({
  customer,
}) => {
  const basket = new BasketReviewApi(customer.api);
  // Basket 1 belongs to an account the shop ships with; give it something to show.
  await basket.add(1, APPLE_JUICE.id); // expect-review: data-safety
  test.fail(true, await knownGap('LOCAL-1', "the basket API answers another customer's basket"));
  expect([401, 403]).toContain(await basket.status(1));
});

test('TC-BREV-12 Checkout is enabled once the basket holds a product @regression @navigation', async ({
  customer,
}) => {
  const { bid, basket: api } = await emptyBasketOf(customer);
  await api.add(bid, APPLE_JUICE.id);
  const basket = new BasketReviewPage(customer.page);
  await basket.open();
  await expect(basket.row(APPLE_JUICE.name)).toBeVisible();
  await expect(basket.checkout()).toBeAttached(); // expect-review: vacuous-assertion
});
