// The payment step of the checkout (registry/checkout.md): the new card form, a saved card, the card
// number masked wherever it appears again, and Back and reload around the step. Every case writes a
// basket line, an address and a card to an account created for it, which stays until the container
// restarts; the steps before the payment are arranged through `api/` and walked through the flows.

import { BasketApi } from '../../api/basket-api';
import { CatalogueApi } from '../../api/catalogue-api';
import { CheckoutApi, type SavedAddress } from '../../api/checkout-api';
import { anAddress } from '../../builders/address-builder';
import { aCard, cardDigits, lastFour, wholeNumberPattern } from '../../builders/card-builder';
import { AccountMenu } from '../../components/account-menu';
import { expect, test, type Actor } from '../../fixtures';
import {
  chooseDelivery,
  chooseSavedAddress,
  chooseSavedCard,
  startCheckout,
} from '../../flows/shopping';
import { storedText } from '../../../../helpers/storage';
import { AddressSelectPage } from '../../pages/address-select-page';
import { BasketPage } from '../../pages/basket-page';
import { DeliveryPage, type DeliveryMethod } from '../../pages/delivery-page';
import { OrderCompletionPage } from '../../pages/order-completion-page';
import { OrderHistoryPage } from '../../pages/order-history-page';
import { OrderSummaryPage } from '../../pages/order-summary-page';
import { PaymentPage } from '../../pages/payment-page';

// <PRODUCT>: the most stocked product without a limit per customer (the `stockedProduct` fixture).
let PRODUCT = '';
test.beforeEach(({ stockedProduct }) => {
  PRODUCT = stockedProduct.name;
});
const INVALID_NUMBER = 'Please enter a valid sixteen digit card number.';
const NO_NAME = 'Please provide a name.';
const money = (amount: number) => `${amount.toFixed(2)}¤`;

test.beforeEach(({ qa }) => {
  test.skip(
    !qa.allowWrites,
    'the cases add a basket line, an address and a card; allow_writes is false',
  );
  // Every case first walks the basket, the address and the delivery step, after four API calls
  // that arrange them; with other specs running against the same container that setup alone took
  // up to 28 s (TC-CHECKOUT-11 traces, 2026-10-26), so every case gets three times the time.
  test.slow();
});

/**
 * Put <PRODUCT> in the customer's basket and save an address through the API, then walk the basket,
 * the address and the delivery step to the payment step.
 */
async function reachPayment(
  customer: Actor,
  method: DeliveryMethod = 'Standard Delivery',
): Promise<SavedAddress> {
  const { page, api, account } = customer;
  if (!account) throw new Error('A fresh customer has an account.');
  const product = await new CatalogueApi(api).product(PRODUCT);
  await (await BasketApi.of(api, account)).add(product.id);
  const address = await new CheckoutApi(api).addAddress(anAddress());

  const basket = new BasketPage(page);
  const contents = basket.contentsLoaded();
  await basket.open();
  await contents;
  await expect(basket.row(PRODUCT)).toBeVisible();
  await startCheckout(page);
  await expect(new AddressSelectPage(page).heading()).toBeVisible();
  await chooseSavedAddress(page, address.fullName);
  await expect(new DeliveryPage(page).heading()).toBeVisible();
  await chooseDelivery(page, method);
  await expect(new PaymentPage(page).heading()).toBeVisible();
  return address;
}

test('TC-CHECKOUT-10 the new card form keeps Submit disabled until valid; 15 and 17 digits say "Please enter a valid sixteen digit card number.", 16 digits are accepted, and an empty Name says "Please provide a name." @regression', async ({
  actor,
}) => {
  const customer = await actor('customer', { fresh: true });
  await reachPayment(customer);
  const payment = new PaymentPage(customer.page);
  const card = aCard();

  await test.step('open the empty form', async () => {
    await payment.openNewCard();
    await expect(payment.name()).toBeVisible();
    await expect(payment.submit()).toBeDisabled();
  });

  await test.step('type 15 digits', async () => {
    await payment.fill(card, cardDigits(15));
    await payment.leaveFields();
    await expect(payment.message(INVALID_NUMBER)).toBeVisible();
    await expect(payment.submit()).toBeDisabled();
  });

  await test.step('type 16 digits', async () => {
    await payment.fill(card, cardDigits(16));
    await payment.leaveFields();
    await expect(payment.message(INVALID_NUMBER)).toBeHidden();
    await expect(payment.message(NO_NAME)).toBeHidden();
    await expect(payment.submit()).toBeEnabled();
  });

  await test.step('type 17 digits', async () => {
    await payment.fill(card, cardDigits(17));
    await payment.leaveFields();
    await expect(payment.message(INVALID_NUMBER)).toBeVisible();
    await expect(payment.submit()).toBeDisabled();
  });

  await test.step('leave Name empty with 16 digits', async () => {
    await payment.fill({ ...card, fullName: '' }, cardDigits(16));
    await payment.leaveFields();
    await expect(payment.message(NO_NAME)).toBeVisible();
    await expect(payment.message(INVALID_NUMBER)).toBeHidden();
    await expect(payment.submit()).toBeDisabled();
  });
});

test('TC-CHECKOUT-11 a saved card is listed as "************<LAST4>" with its holder and expiry, says "Your card ending with <LAST4> has been saved for your convenience.", the API holds it, and Continue is enabled once it is chosen @regression @security', async ({
  actor,
}) => {
  const customer = await actor('customer', { fresh: true });
  await reachPayment(customer);
  const payment = new PaymentPage(customer.page);
  const card = aCard();
  const last4 = lastFour(card);

  await test.step('save a card through the form', async () => {
    await expect(payment.proceed()).toBeDisabled();
    await payment.openNewCard();
    await payment.fill(card);
    await payment.submit().click();
    await expect(
      payment.notification(`Your card ending with ${last4} has been saved for your convenience.`),
    ).toBeVisible();
  });

  await test.step('read the listed card', async () => {
    const listed = payment.card(last4);
    await expect(listed).toContainText(`************${last4}`);
    await expect(listed).toContainText(card.fullName);
    await expect(listed).toContainText(`${card.expMonth}/${card.expYear}`);
    await expect(listed).not.toContainText(wholeNumberPattern(card));
  });

  await test.step('read the card back through the API', async () => {
    const cards = await new CheckoutApi(customer.api).cards();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      fullName: card.fullName,
      cardNum: `************${last4}`,
      expMonth: card.expMonth,
      expYear: card.expYear,
    });
  });

  await test.step('choose the card', async () => {
    await expect(payment.proceed()).toBeDisabled();
    await payment.choose(last4);
    await expect(payment.proceed()).toBeEnabled();
  });
});

test('TC-CHECKOUT-19 after a card is saved, its whole number appears nowhere: not in the card list, the summary, the order history, the URL or browser storage @regression @security', async ({
  actor,
  app,
}) => {
  const customer = await actor('customer', { fresh: true });
  const { page } = customer;
  await reachPayment(customer);
  const payment = new PaymentPage(page);
  const card = aCard();
  const last4 = lastFour(card);
  // The 16 digits run together or grouped by spaces or dashes, as a page could show them.
  const whole = wholeNumberPattern(card);
  const nowhereElse = async () => {
    await expect(page).not.toHaveURL(whole);
    expect(await storedText(page)).not.toMatch(whole);
  };

  await test.step('save a card through the form', async () => {
    await payment.openNewCard();
    await payment.fill(card);
    await payment.submit().click();
    await expect(
      payment.notification(`Your card ending with ${last4} has been saved for your convenience.`),
    ).toBeVisible();
  });

  await test.step('read the card list', async () => {
    await expect(payment.card(last4)).toBeVisible();
    await expect(payment.text(whole)).toHaveCount(0);
    await nowhereElse();
  });

  await test.step('choose the card and read the summary', async () => {
    await chooseSavedCard(page, card);
    const summary = new OrderSummaryPage(page);
    await expect(summary.product(PRODUCT)).toBeVisible();
    await expect(summary.shows(`Card ending in ${last4}`)).toBeVisible();
    await expect(summary.shows(whole)).toHaveCount(0);
    await nowhereElse();
  });

  let orderId = '';
  await test.step('place the order', async () => {
    const summary = new OrderSummaryPage(page);
    const answered = summary.orderAnswered();
    await summary.placeOrder().click();
    expect(await answered).toBe(200);
    const completion = new OrderCompletionPage(page);
    await expect(completion.heading()).toBeVisible();
    orderId = completion.orderId();
    await nowhereElse();
  });

  await test.step('read the order history', async () => {
    await AccountMenu.for(page, app).openOrderHistory();
    const history = new OrderHistoryPage(page);
    await expect(history.order(orderId)).toBeVisible();
    await expect(history.product(PRODUCT)).toBeVisible();
    await expect(history.text(whole)).toHaveCount(0);
    await nowhereElse();
  });
});

test('TC-CHECKOUT-20 Back on the payment and delivery steps returns to the step before, and a reload of the payment step keeps the chosen address and delivery method @regression @navigation', async ({
  actor,
}) => {
  const customer = await actor('customer', { fresh: true });
  const { page, api } = customer;
  // A second address the case does not choose: the summary showing the chosen one after the reload
  // is then evidence that the choice survived, not that it is the only address there is.
  const decoy = await new CheckoutApi(api).addAddress(anAddress());
  const method: DeliveryMethod = 'Fast Delivery';
  const delivery = (await new CheckoutApi(api).deliveryMethods()).find((m) => m.name === method);
  if (!delivery) throw new Error(`The shop has no "${method}".`);
  const card = aCard();
  await new CheckoutApi(api).addCard(card);
  const address = await reachPayment(customer, method);
  const payment = new PaymentPage(page);
  const deliveryStep = new DeliveryPage(page);
  const select = new AddressSelectPage(page);

  await test.step('Back on the payment step', async () => {
    await payment.back().click();
    await expect(page).toHaveURL(/#\/delivery-method$/);
    await expect(deliveryStep.heading()).toBeVisible();
  });

  await test.step('Back on the delivery step', async () => {
    await deliveryStep.back().click();
    await expect(page).toHaveURL(/#\/address\/select$/);
    await expect(select.heading()).toBeVisible();
  });

  await test.step('walk forward to the payment step again', async () => {
    await chooseSavedAddress(page, address.fullName);
    await expect(deliveryStep.heading()).toBeVisible();
    await chooseDelivery(page, method);
    await expect(payment.heading()).toBeVisible();
  });

  await test.step('reload the payment step', async () => {
    await page.reload();
    await expect(page).toHaveURL(/#\/payment\/shop$/);
    await expect(payment.heading()).toBeVisible();
    await expect(payment.card(lastFour(card))).toBeVisible();
  });

  await test.step('go on to the summary with the saved card', async () => {
    await chooseSavedCard(page, card);
    const summary = new OrderSummaryPage(page);
    await expect(summary.product(PRODUCT)).toBeVisible();
    await expect(summary.shows(address.fullName)).toBeVisible();
    await expect(summary.shows(address.streetAddress)).toBeVisible();
    await expect(summary.shows(decoy.fullName)).toHaveCount(0);
    await expect(summary.amount('Delivery')).toHaveText(money(delivery.price));
  });
});
