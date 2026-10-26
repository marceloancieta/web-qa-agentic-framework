// The pack's journeys (registry/journeys.md): each step through the UI as a user takes it, over the
// flows the feature specs share, each hand-over asserted in its own step, and the end read back
// through the API. The page starts signed out; the accounts are created for the case and stay until
// the container restarts.

import { AccountApi } from '../../api/account-api';
import { BasketApi } from '../../api/basket-api';
import { CatalogueApi } from '../../api/catalogue-api';
import { CheckoutApi } from '../../api/checkout-api';
import { aCustomer, securityAnswer } from '../../builders/account-builder';
import { anAddress } from '../../builders/address-builder';
import { aCard } from '../../builders/card-builder';
import { AccountMenu } from '../../components/account-menu';
import { Toolbar } from '../../components/toolbar';
import { expect, test } from '../../fixtures';
import {
  chooseDelivery,
  chooseNewAddress,
  payWithNewCard,
  registerThroughForm,
  searchAndAdd,
  signInThroughForm,
  startCheckout,
} from '../../flows/shopping';
import { AddressSelectPage } from '../../pages/address-select-page';
import { BasketPage } from '../../pages/basket-page';
import { DeliveryPage } from '../../pages/delivery-page';
import { OrderCompletionPage } from '../../pages/order-completion-page';
import { OrderHistoryPage } from '../../pages/order-history-page';
import { OrderSummaryPage } from '../../pages/order-summary-page';
import { PaymentPage } from '../../pages/payment-page';
import { SearchPage } from '../../pages/search-page';

// <PRODUCT>: the most stocked product without a limit per customer (the `stockedProduct` fixture).
let PRODUCT = '';
test.beforeEach(({ stockedProduct }) => {
  PRODUCT = stockedProduct.name;
});
const DELIVERY = 'One Day Delivery';
const money = (amount: number) => `${amount.toFixed(2)}¤`;

test.beforeEach(({ qa }) => {
  test.skip(!qa.allowWrites, 'the journeys create accounts and orders; allow_writes is false');
  // A journey walks a dozen pages; it gets three times the time of a case about one.
  test.slow();
});

test("TC-JOURNEY-01 a customer signs in through the form, searches for <PRODUCT> by its name, adds it, checks out with a new address, One Day Delivery and a new card, places the order and finds it in the order history with the completion page's total @smoke @e2e", async ({
  page,
  actor,
  app,
}) => {
  // The account comes before the journey; its API client is how the end is read back.
  const buyer = await actor('customer', { fresh: true });
  const account = buyer.account;
  if (!account) throw new Error('A fresh customer has an account.');
  const product = await new CatalogueApi(buyer.api).product(PRODUCT);
  const delivery = (await new CheckoutApi(buyer.api).deliveryMethods()).find(
    (method) => method.name === DELIVERY,
  );
  if (!delivery) throw new Error(`The shop has no "${DELIVERY}".`);
  const total = money(product.price + delivery.price);
  const address = anAddress();
  const card = aCard();
  const completion = new OrderCompletionPage(page);

  await test.step('sign in through the login form', async () => {
    await signInThroughForm(page, account);
    await expect(page).toHaveURL(/#\/search$/);
  });

  await test.step('search for the product by its name and add it', async () => {
    await searchAndAdd(page, PRODUCT, PRODUCT);
    await expect(page).toHaveURL(/#\/search\?q=.+/);
    await expect(new SearchPage(page).product(PRODUCT)).toBeVisible();
    await expect(new SearchPage(page).notification(`Placed ${PRODUCT} into basket.`)).toBeVisible();
    await expect(new Toolbar(page).basketButton()).toContainText('1');
  });

  await test.step('open the basket and check out', async () => {
    await startCheckout(page);
    await expect(new AddressSelectPage(page).heading()).toBeVisible();
  });

  await test.step('add an address and choose it', async () => {
    await chooseNewAddress(page, address);
    await expect(new DeliveryPage(page).heading()).toBeVisible();
  });

  await test.step('choose One Day Delivery', async () => {
    await chooseDelivery(page, DELIVERY);
    await expect(new PaymentPage(page).heading()).toBeVisible();
  });

  await test.step('add a card and choose it', async () => {
    await payWithNewCard(page, card);
    await expect(new OrderSummaryPage(page).product(PRODUCT)).toBeVisible();
  });

  await test.step('place the order', async () => {
    await new OrderSummaryPage(page).placeOrder().click();
    await expect(completion.heading()).toBeVisible();
    await expect(completion.product(PRODUCT)).toBeVisible();
    await expect(completion.amount('Total Price')).toHaveText(total);
  });
  const orderId = completion.orderId();

  await test.step('find the order in the order history', async () => {
    await AccountMenu.for(page, app).openOrderHistory();
    const history = new OrderHistoryPage(page);
    await expect(history.order(orderId)).toBeVisible();
    await expect(history.shows(total)).toBeVisible();
    await expect(history.product(PRODUCT)).toBeVisible();
  });

  await test.step('read the order back through the API', async () => {
    const [saved] = await new CheckoutApi(buyer.api).addresses();
    const [stored] = await new CheckoutApi(buyer.api).cards();
    const order = (await new CheckoutApi(buyer.api).orders()).find((o) => o.orderId === orderId);
    expect(order).toMatchObject({
      totalPrice: product.price + delivery.price,
      deliveryPrice: delivery.price,
      addressId: String(saved?.id),
      paymentId: String(stored?.id),
      products: [expect.objectContaining({ name: PRODUCT, quantity: 1 })],
    });
  });
});

test('TC-JOURNEY-02 a visitor registers through the form, signs in through the form with the new account, and sees <EMAIL> in the account menu and an empty basket titled with it @smoke @e2e', async ({
  page,
  actor,
  app,
}) => {
  const guest = await actor('anonymous');
  const account = aCustomer('journey-new', test.info().workerIndex);

  await test.step('register through the form', async () => {
    await registerThroughForm(page, account, securityAnswer());
    await expect(page).toHaveURL(/#\/login$/);
  });

  await test.step('sign in through the login form with the new account', async () => {
    await signInThroughForm(page, account);
    await expect(page).toHaveURL(/#\/search$/);
  });

  await test.step('open the basket', async () => {
    const basket = new BasketPage(page);
    const loaded = basket.contentsLoaded();
    await new Toolbar(page).openBasket();
    await loaded;
    await expect(basket.title()).toHaveText(`Your Basket (${account.username})`);
    await expect(basket.rows()).toHaveCount(0);
    await expect(basket.total()).toHaveText('Total Price: 0¤');
  });

  // Last: below the toolbar breakpoint the menu is the side navigation, which covers the page.
  await test.step('open the account menu', async () => {
    const menu = AccountMenu.for(page, app);
    await menu.open();
    await expect(menu.account(account.username)).toBeVisible();
  });

  await test.step('read the account and its basket back through the API', async () => {
    const { token } = await new AccountApi(guest.api).login(account);
    expect(await new AccountApi(guest.api).whoami(token)).toBe(account.username);
    expect(await (await BasketApi.of(guest.api, account)).lines()).toEqual([]);
  });
});
