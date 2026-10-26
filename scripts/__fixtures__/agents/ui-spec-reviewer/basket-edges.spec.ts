// The basket review cases about sessions, removing, reloading and the layout: TC-BREV-06, and 08
// to 11.

import { expect, test } from '../../../../apps/juice-shop/fixtures';
import { knownGap } from '../../../../helpers/case-meta';
import { clippedText } from '../../../../helpers/layout';
import { APPLE_JUICE, BasketReviewPage, emptyBasketOf, ORANGE_JUICE } from './review-blocks';

test('TC-BREV-06 without a session, /#/basket opens the login and shows no basket @regression @security @known-gap', async ({
  actor,
}) => {
  test.fail(true, await knownGap('LOCAL-3', 'the basket opens without a session')); // expect-review: case-shape
  const visitor = await actor('anonymous');
  const basket = new BasketReviewPage(visitor.page);
  await basket.open();
  await expect(visitor.page).toHaveURL(/#\/login$/);
  await expect(basket.title()).toHaveCount(0);
});

// expect-review: missing-oracle
test('TC-BREV-08 removing the last product empties the basket @regression', async ({ customer }) => {
  const { bid, basket: api } = await emptyBasketOf(customer);
  await api.add(bid, APPLE_JUICE.id);
  const basket = new BasketReviewPage(customer.page);
  await basket.open();
  await expect(basket.row(APPLE_JUICE.name)).toBeVisible();
  await basket.remove(APPLE_JUICE.name);
  await expect(basket.rows()).toHaveCount(0);
  await expect(basket.total()).toHaveText('Total Price: 0¤');
});

// expect-review: registry-fidelity
test('TC-BREV-09 a basket with a product keeps it after a reload @regression @navigation', async ({
  customer,
}) => {
  const { bid, basket: api } = await emptyBasketOf(customer);
  await api.add(bid, APPLE_JUICE.id);
  const basket = new BasketReviewPage(customer.page);
  await basket.open();
  await expect(basket.row(APPLE_JUICE.name)).toBeVisible();
  await customer.page.reload();
  await expect(basket.row(APPLE_JUICE.name)).toBeVisible();
  await expect(basket.rows()).toHaveCount(1);
});

test('TC-BREV-10 a basket with products has no horizontal scroll @regression @responsive', async ({
  customer,
}) => {
  const { bid, basket: api } = await emptyBasketOf(customer);
  await api.add(bid, APPLE_JUICE.id);
  await api.add(bid, ORANGE_JUICE.id);
  const basket = new BasketReviewPage(customer.page);
  await basket.open();
  await expect(basket.rows()).toHaveCount(2);
  const overflow = await customer.page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth, // expect-review: layering
  );
  expect(overflow).toBe(0);
});

test('TC-BREV-11 the title shows "Your Basket (<EMAIL>)" whole, with no character clipped @regression @content', async ({
  customer,
}) => {
  await emptyBasketOf(customer);
  const basket = new BasketReviewPage(customer.page);
  await basket.open();
  await expect(basket.title()).toHaveText(`Your Basket (${customer.account?.username})`);
  expect(await clippedText(basket.title())).toEqual([]);
});
