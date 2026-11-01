// Visual: the cart with two products on every device project, compared with baselines rendered in
// the pinned image (npm run lanes:visual). Every other run leaves this file's cases out. The cart is
// written to local storage before the page opens, so every run shows the same two rows; the page
// shows nothing sensitive, so nothing is masked.

import { CartStorage } from '../../api/cart-storage';
import { BACKPACK, BIKE_LIGHT } from '../../builders/products';
import { expect, test } from '../../fixtures';
import { CartPage } from '../../pages/cart-page';

test('TC-CART-16 the cart with two products looks as designed @regression @visual @layout', async ({
  standard,
  visual,
}) => {
  const { page, context } = standard;
  await CartStorage.prepare(context, [BACKPACK, BIKE_LIGHT]);
  const cart = new CartPage(page);

  await cart.open();
  await expect(cart.names()).toHaveText([BACKPACK.name, BIKE_LIGHT.name]);
  await expect(cart.header.cartBadge()).toHaveText('2');
  await expect(cart.checkoutButton()).toBeVisible();

  await visual.expectToMatch(page, 'cart-with-products.png', [], { wholePage: true });
});
