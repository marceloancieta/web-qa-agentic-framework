// The cart (registry/cart.md). Swag Labs keeps the cart in local storage, so every case runs in the
// `standard` actor's own context: a case that starts with products writes them there before the
// first page opens (CartStorage.prepare), and reads the stored ids back to check what the page
// claims. Only TC-CART-01 and -02 press "Add to cart". Nothing is left behind: the context and its
// storage close with the test.

import { knownGap } from '../../../../helpers/case-meta';
import { tabUntil, type FocusStop } from '../../../../helpers/keyboard';
import { horizontalOverflow } from '../../../../helpers/layout';
import { CartStorage } from '../../api/cart-storage';
import { startSession } from '../../api/session';
import { BACKPACK, BIKE_LIGHT } from '../../builders/products';
import { expect, test } from '../../fixtures';
import { CartPage } from '../../pages/cart-page';
import { InventoryPage } from '../../pages/inventory-page';
import { LoginPage } from '../../pages/login-page';
import { ProductPage } from '../../pages/product-page';

// REQ-CART-01 and -02: the cart button's name; TC-CART-15 expects the singular with one product.
const CART_EMPTY = 'Cart, empty';
const cartOf = (count: number) => `Cart, ${count} ${count === 1 ? 'item' : 'items'}`;
const ADD_TO_CART = 'Add to cart';
const REMOVE = 'Remove';
const onlyWhenSignedIn = (path: string) =>
  `Epic sadface: You can only access '${path}' when you are logged in.`;

// Tab presses a step may take to reach its control: the header, the rows and the buttons.
const TAB_LIMIT = 30;

const describeStops = (stops: FocusStop[]) =>
  stops.map((stop) => `${stop.role} "${stop.name}"`).join(', ');

test('TC-CART-01 "Add to cart" for <OTHER_PRODUCT> on the list turns its button into "Remove", shows 1 on the cart badge, and the cart lists <OTHER_PRODUCT> with quantity 1 @smoke', async ({
  standard,
}) => {
  const { page } = standard;
  const inventory = new InventoryPage(page);
  const cart = new CartPage(page);
  const storage = new CartStorage(page);

  await inventory.open();
  await expect(inventory.cartAction(BIKE_LIGHT.name)).toHaveText(ADD_TO_CART);
  await expect(inventory.header.cartBadge()).toHaveCount(0);

  await inventory.addToCart(BIKE_LIGHT.name);

  await expect(inventory.cartAction(BIKE_LIGHT.name)).toHaveText(REMOVE);
  await expect(inventory.header.cartBadge()).toHaveText('1');
  expect(await storage.ids()).toEqual([BIKE_LIGHT.id]);

  await inventory.header.openCart();
  await expect(page).toHaveURL(/\/cart\.html$/);
  await expect(cart.names()).toHaveText([BIKE_LIGHT.name]);
  await expect(cart.quantities()).toHaveText(['1']);
});

test('TC-CART-02 "Add to cart" on <PRODUCT>\'s page puts it in the cart once: the button turns into "Remove", so the product cannot be added twice @regression', async ({
  standard,
}) => {
  const { page } = standard;
  const product = new ProductPage(page);
  const cart = new CartPage(page);
  const storage = new CartStorage(page);

  await product.open(BACKPACK.id);
  await expect(product.name()).toHaveText(BACKPACK.name);
  await expect(product.cartAction()).toHaveText(ADD_TO_CART);

  await product.addToCart();

  // The page's only cart button is now "Remove": there is no "Add to cart" left to press again.
  await expect(product.cartAction()).toHaveText(REMOVE);
  await expect(product.header.cartBadge()).toHaveText('1');
  expect(await storage.ids()).toEqual([BACKPACK.id]);

  await product.header.openCart();
  await expect(cart.names()).toHaveText([BACKPACK.name]);
  await expect(cart.quantities()).toHaveText(['1']);
});

test('TC-CART-03 with <PRODUCT> and <OTHER_PRODUCT> in the cart, "Remove" on <PRODUCT> in the cart leaves only <OTHER_PRODUCT> and the badge shows 1 @regression', async ({
  standard,
  actor,
}) => {
  // <PRODUCT> is the first row in one cart and the last in another, so a "Remove" that removed a
  // row by its position instead of its own product fails one of the two.
  const carts = [
    { actor: standard, added: [BACKPACK, BIKE_LIGHT] },
    { actor: await actor('standard'), added: [BIKE_LIGHT, BACKPACK] },
  ];
  for (const { actor: shopper, added } of carts) {
    await test.step(`cart of ${added.map((product) => product.name).join(', ')}`, async () => {
      await CartStorage.prepare(shopper.context, added);
      const cart = new CartPage(shopper.page);
      const storage = new CartStorage(shopper.page);

      await cart.open();
      await expect(cart.names()).toHaveText(added.map((product) => product.name));
      await expect(cart.header.cartBadge()).toHaveText('2');

      await cart.remove(BACKPACK.name);

      await expect(cart.names()).toHaveText([BIKE_LIGHT.name]);
      await expect(cart.header.cartBadge()).toHaveText('1');
      expect(await storage.ids()).toEqual([BIKE_LIGHT.id]);
    });
  }
});

test('TC-CART-04 with <PRODUCT> in the cart, "Remove" on the list turns the button back into "Add to cart", the badge disappears and the cart button is named "Cart, empty" @regression', async ({
  standard,
}) => {
  const { page, context } = standard;
  await CartStorage.prepare(context, [BACKPACK]);
  const inventory = new InventoryPage(page);
  const storage = new CartStorage(page);

  await inventory.open();
  await expect(inventory.cartAction(BACKPACK.name)).toHaveText(REMOVE);
  await expect(inventory.header.cartBadge()).toHaveText('1');

  await inventory.remove(BACKPACK.name);

  await expect(inventory.cartAction(BACKPACK.name)).toHaveText(ADD_TO_CART);
  await expect(inventory.header.cartBadge()).toHaveCount(0);
  await expect(inventory.header.cartButton()).toHaveAccessibleName(CART_EMPTY);
  expect(await storage.ids()).toEqual([]);
});

test('TC-CART-05 the cart lists <PRODUCT> then <OTHER_PRODUCT> in the order added, each with quantity 1 and the name, description and price the list shows @regression', async ({
  standard,
  actor,
}) => {
  const { page, context } = standard;
  await CartStorage.prepare(context, [BACKPACK, BIKE_LIGHT]);
  const cart = new CartPage(page);
  const inventory = new InventoryPage(page);

  await cart.open();
  await expect(cart.names()).toHaveText([BACKPACK.name, BIKE_LIGHT.name]);
  await expect(cart.quantities()).toHaveText(['1', '1']);
  await expect(cart.descriptions()).toHaveText([/\S/, /\S/]);
  await expect(cart.prices()).toHaveText([/^\$\d+\.\d{2}$/, /^\$\d+\.\d{2}$/]);
  const descriptions = await cart.descriptions().allTextContents();
  const prices = await cart.prices().allTextContents();

  await test.step('the list shows the same description and price for each product', async () => {
    await inventory.open();
    for (const [index, product] of [BACKPACK, BIKE_LIGHT].entries()) {
      await expect(inventory.productDescription(product.name)).toHaveText(descriptions[index]!);
      await expect(inventory.productPrice(product.name)).toHaveText(prices[index]!);
    }
  });

  await test.step('added the other way round, the cart follows the order added', async () => {
    // The list shows the Backpack before the Bike Light, so the order above alone could be the
    // list's; a second cart of the same account, added the other way round, tells them apart.
    const other = await actor('standard');
    await CartStorage.prepare(other.context, [BIKE_LIGHT, BACKPACK]);
    const otherCart = new CartPage(other.page);
    await otherCart.open();
    await expect(otherCart.names()).toHaveText([BIKE_LIGHT.name, BACKPACK.name]);
    await expect(otherCart.quantities()).toHaveText(['1', '1']);
  });
});

test('TC-CART-06 an empty cart shows only the column labels, "Continue Shopping" and "Checkout" @regression', async ({
  standard,
}) => {
  const { page } = standard;
  const cart = new CartPage(page);

  await cart.open();

  await expect(cart.columnLabels()).toHaveText(['QTY', 'Description']);
  await expect(cart.continueShoppingButton()).toBeVisible();
  await expect(cart.checkoutButton()).toBeVisible();
  await expect(cart.rows()).toHaveCount(0);
  await expect(cart.removeButtons()).toHaveCount(0);
  await expect(cart.header.cartBadge()).toHaveCount(0);
});

test('TC-CART-07 <PRODUCT> and <OTHER_PRODUCT> stay in the cart after a reload, and after a visit to the list and a product page @regression @navigation', async ({
  standard,
}) => {
  const { page, context } = standard;
  await CartStorage.prepare(context, [BACKPACK, BIKE_LIGHT]);
  const cart = new CartPage(page);
  const inventory = new InventoryPage(page);
  const product = new ProductPage(page);
  const storage = new CartStorage(page);

  await cart.open();
  await expect(cart.names()).toHaveText([BACKPACK.name, BIKE_LIGHT.name]);

  await test.step('reload the cart', async () => {
    await page.reload();
    await expect(cart.names()).toHaveText([BACKPACK.name, BIKE_LIGHT.name]);
    await expect(cart.header.cartBadge()).toHaveText('2');
  });

  await test.step('visit the list', async () => {
    await inventory.open();
    await expect(inventory.cartAction(BACKPACK.name)).toHaveText(REMOVE);
    await expect(inventory.cartAction(BIKE_LIGHT.name)).toHaveText(REMOVE);
    await expect(inventory.header.cartBadge()).toHaveText('2');
  });

  await test.step("visit <PRODUCT>'s page", async () => {
    await product.open(BACKPACK.id);
    await expect(product.name()).toHaveText(BACKPACK.name);
    await expect(product.cartAction()).toHaveText(REMOVE);
    await expect(product.header.cartBadge()).toHaveText('2');
  });

  await test.step('back to the cart through its button', async () => {
    await product.header.openCart();
    await expect(cart.names()).toHaveText([BACKPACK.name, BIKE_LIGHT.name]);
    expect(await storage.ids()).toEqual([BACKPACK.id, BIKE_LIGHT.id]);
  });
});

test("TC-CART-08 <PRODUCT>'s name in the cart opens its product page @regression @navigation", async ({
  standard,
  qa,
}) => {
  const { page, context } = standard;
  await CartStorage.prepare(context, [BACKPACK]);
  const cart = new CartPage(page);
  const product = new ProductPage(page);

  await cart.open();
  await expect(cart.names()).toHaveText([BACKPACK.name]);

  await cart.openProduct(BACKPACK.name);

  await expect(page).toHaveURL(`${qa.baseUrl}/inventory-item.html?id=${BACKPACK.id}`);
  await expect(product.name()).toHaveText(BACKPACK.name);
});

test('TC-CART-09 "Continue Shopping" leads to /inventory.html and "Checkout" to /checkout-step-one.html, with the cart unchanged @regression @navigation', async ({
  standard,
  qa,
}) => {
  const { page, context } = standard;
  await CartStorage.prepare(context, [BACKPACK, BIKE_LIGHT]);
  const cart = new CartPage(page);
  const inventory = new InventoryPage(page);
  const storage = new CartStorage(page);

  await cart.open();
  await expect(cart.names()).toHaveText([BACKPACK.name, BIKE_LIGHT.name]);

  await test.step('"Continue Shopping" leads to the list', async () => {
    await cart.continueShopping();
    await expect(page).toHaveURL(`${qa.baseUrl}/inventory.html`);
    await expect(inventory.list()).toBeVisible();
    await expect(inventory.header.cartBadge()).toHaveText('2');
    expect(await storage.ids()).toEqual([BACKPACK.id, BIKE_LIGHT.id]);
  });

  await test.step('"Checkout" leads to the first checkout step', async () => {
    await inventory.header.openCart();
    await expect(cart.names()).toHaveText([BACKPACK.name, BIKE_LIGHT.name]);
    await cart.checkout();
    await expect(page).toHaveURL(`${qa.baseUrl}/checkout-step-one.html`);
    await expect(cart.header.cartBadge()).toHaveText('2');
    expect(await storage.ids()).toEqual([BACKPACK.id, BIKE_LIGHT.id]);
  });
});

test('TC-CART-10 "Reset App State" in the menu empties the cart: the badge disappears and the cart lists nothing @regression @known-gap', async ({
  standard,
}) => {
  const { page, context } = standard;
  await CartStorage.prepare(context, [BACKPACK, BIKE_LIGHT]);
  const cart = new CartPage(page);
  const storage = new CartStorage(page);

  await cart.open();
  await expect(cart.names()).toHaveText([BACKPACK.name, BIKE_LIGHT.name]);
  await expect(cart.header.cartBadge()).toHaveText('2');

  await cart.header.choose('Reset App State');

  await expect(cart.header.cartBadge()).toHaveCount(0);
  expect(await storage.ids()).toEqual([]);
  // The cart page the user is on, not a new visit to it: what it lists after the reset.
  test.fail(true, await knownGap('LOCAL-28', 'the open cart keeps its rows until a reload'));
  await expect(cart.rows()).toHaveCount(0);
});

test('TC-CART-11 /cart.html opened without a session sends the visitor to / with the message naming the path @regression @security', async ({
  page,
  qa,
}) => {
  const login = new LoginPage(page);
  const cart = new CartPage(page);

  await cart.open();

  await expect(login.error()).toHaveText(onlyWhenSignedIn('/cart.html'));
  await expect(page).toHaveURL(`${qa.baseUrl}/`);
  await expect(cart.rows()).toHaveCount(0);
});

test('TC-CART-12 after Logout and a new login, the cart is empty @regression @security @known-gap', async ({
  standard,
  qa,
}) => {
  const { page, context } = standard;
  await CartStorage.prepare(context, [BACKPACK]);
  const cart = new CartPage(page);
  const login = new LoginPage(page);
  const inventory = new InventoryPage(page);
  const storage = new CartStorage(page);

  await cart.open();
  await expect(cart.names()).toHaveText([BACKPACK.name]);

  await test.step('Logout', async () => {
    await cart.header.choose('Logout');
    await expect(page).toHaveURL(`${qa.baseUrl}/`);
    await expect(login.loginButton()).toBeVisible();
  });

  await test.step('a new login of the same account', async () => {
    // The login form only writes the session cookie (app-notes), so the new session is that
    // cookie, without a password in the trace; the form itself is the login registry's subject.
    await startSession(context, qa.baseUrl, standard.account!.username);
    await inventory.open();
    await expect(page).toHaveURL(`${qa.baseUrl}/inventory.html`);
    await expect(inventory.list()).toBeVisible();
  });

  test.fail(true, await knownGap('LOCAL-29', 'Logout leaves the cart in the browser'));
  await test.step('the cart is empty', async () => {
    await expect(inventory.header.cartBadge()).toHaveCount(0);
    await expect(inventory.header.cartButton()).toHaveAccessibleName(CART_EMPTY);
    expect(await storage.ids()).toEqual([]);
    await inventory.header.openCart();
    await expect(cart.rows()).toHaveCount(0);
  });
});

test('TC-CART-13 the cart with two products has no horizontal scroll @regression @responsive', async ({
  standard,
}) => {
  const { page, context } = standard;
  await CartStorage.prepare(context, [BACKPACK, BIKE_LIGHT]);
  const cart = new CartPage(page);

  await cart.open();
  await expect(cart.names()).toHaveText([BACKPACK.name, BIKE_LIGHT.name]);
  await expect(cart.checkoutButton()).toBeVisible();

  await expect.poll(() => horizontalOverflow(page)).toBe(0);
});

test('TC-CART-14 "Remove", "Continue Shopping" and "Checkout" are reached and used with the keyboard alone @regression @a11y', async ({
  standard,
  qa,
}) => {
  const { page, context } = standard;
  await CartStorage.prepare(context, [BACKPACK, BIKE_LIGHT]);
  const cart = new CartPage(page);
  const inventory = new InventoryPage(page);
  const storage = new CartStorage(page);

  await cart.open();
  await expect(cart.names()).toHaveText([BACKPACK.name, BIKE_LIGHT.name]);
  await expect(cart.removeButtons()).toHaveCount(2);

  await test.step('Tab reaches the "Remove" of <PRODUCT> and Enter removes it', async () => {
    const target = cart.removeButton(BACKPACK.name);
    const stops = await tabUntil(page, target, TAB_LIMIT);
    await expect(target, `Tab passed ${describeStops(stops)}`).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(cart.names()).toHaveText([BIKE_LIGHT.name]);
    expect(await storage.ids()).toEqual([BIKE_LIGHT.id]);
  });

  await test.step('Tab reaches "Continue Shopping" and Enter leads to the list', async () => {
    await tabUntil(page, cart.continueShoppingButton(), TAB_LIMIT);
    await expect(cart.continueShoppingButton()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`${qa.baseUrl}/inventory.html`);
    await expect(inventory.list()).toBeVisible();
  });

  await test.step('Tab reaches "Checkout" and Enter leads to the first checkout step', async () => {
    await cart.open();
    await expect(cart.names()).toHaveText([BIKE_LIGHT.name]);
    await tabUntil(page, cart.checkoutButton(), TAB_LIMIT);
    await expect(cart.checkoutButton()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`${qa.baseUrl}/checkout-step-one.html`);
  });
});

test('TC-CART-15 the cart button is named "Cart, empty", "Cart, 1 item" and "Cart, 2 items" as the cart holds 0, 1 and 2 products, and the cart page has no axe violation beyond the baseline @regression @a11y @known-gap', async ({
  standard,
  actor,
  a11y,
}) => {
  // One context per cart size, each prepared before its first page. One product comes last: its
  // name is the one the contract records as wrong (G1), so the other checks all run before it.
  await test.step('0 products: "Cart, empty"', async () => {
    const cart = new CartPage(standard.page);
    await cart.open();
    await expect(cart.continueShoppingButton()).toBeVisible();
    await expect(cart.header.cartButton()).toHaveAccessibleName(CART_EMPTY);
    await a11y.expectNoNewViolations(standard.page);
  });

  await test.step('2 products: "Cart, 2 items"', async () => {
    const two = await actor('standard');
    await CartStorage.prepare(two.context, [BACKPACK, BIKE_LIGHT]);
    const cart = new CartPage(two.page);
    await cart.open();
    await expect(cart.names()).toHaveText([BACKPACK.name, BIKE_LIGHT.name]);
    await expect(cart.header.cartButton()).toHaveAccessibleName(cartOf(2));
    await a11y.expectNoNewViolations(two.page);
  });

  await test.step('1 product: "Cart, 1 item"', async () => {
    const one = await actor('standard');
    await CartStorage.prepare(one.context, [BACKPACK]);
    const cart = new CartPage(one.page);
    await cart.open();
    await expect(cart.names()).toHaveText([BACKPACK.name]);
    await a11y.expectNoNewViolations(one.page);
    test.fail(true, await knownGap('LOCAL-30', 'one product is named "Cart, 1 items"'));
    await expect(cart.header.cartButton()).toHaveAccessibleName(cartOf(1));
  });
});
