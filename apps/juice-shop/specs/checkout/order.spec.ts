// The checkout cases about the order itself (registry/checkout.md): the summary, placing the order,
// the history and tracking, the routes without a session, the summary's layout and loading, and the
// step buttons' names. Every case that writes takes a customer of its own, since it adds addresses,
// cards and orders that stay until the container restarts; the products, the address and the card
// go in through `api/`, and the steps the case is about are walked through the UI.

import type { Locator, Page } from '@playwright/test';
import { BasketApi } from '../../api/basket-api';
import { CatalogueApi, type Product } from '../../api/catalogue-api';
import { CheckoutApi, type Order } from '../../api/checkout-api';
import { anAddress, longStreet, type Address } from '../../builders/address-builder';
import { aCard, lastFour, longHolderName, type Card } from '../../builders/card-builder';
import { Toolbar } from '../../components/toolbar';
import { expect, test } from '../../fixtures';
import { chooseDelivery, chooseSavedAddress, chooseSavedCard } from '../../flows/shopping';
import { slowBasket, slowOrder } from '../../mocks/checkout-mocks';
import { AddressFormPage } from '../../pages/address-form-page';
import { AddressSelectPage } from '../../pages/address-select-page';
import { BasketPage } from '../../pages/basket-page';
import { DeliveryPage, type DeliveryMethod } from '../../pages/delivery-page';
import { LoginPage } from '../../pages/login-page';
import { OrderCompletionPage } from '../../pages/order-completion-page';
import { OrderHistoryPage, TrackResultPage } from '../../pages/order-history-page';
import { OrderSummaryPage } from '../../pages/order-summary-page';
import { PaymentPage } from '../../pages/payment-page';
import {
  clippedText,
  horizontalOverflow,
  settledHorizontalOverflow,
} from '../../../../helpers/layout';
import { knownGap } from '../../../../helpers/case-meta';
import { focusChangesRendering, tabUntil } from '../../../../helpers/keyboard';
import type { Actor } from '../../../../fixtures';

// <PRODUCT>: the most stocked product without a limit per customer (the `stockedProduct` fixture).
let PRODUCT = '';
test.beforeEach(({ stockedProduct }) => {
  PRODUCT = stockedProduct.name;
});
// Fast Delivery costs something and is not the cheapest, so a total that ignored the delivery
// price, or took another method's, would differ from the right one.
const DELIVERY: DeliveryMethod = 'Fast Delivery';
const money = (amount: number) => `${amount.toFixed(2)}¤`;
const TAB_LIMIT = 40;
const METHODS: { name: DeliveryMethod; price: string; days: RegExp }[] = [
  { name: 'One Day Delivery', price: '0.99¤', days: /\b1 Days?\b/ },
  { name: 'Fast Delivery', price: '0.50¤', days: /\b3 Days?\b/ },
  { name: 'Standard Delivery', price: '0.00¤', days: /\b5 Days?\b/ },
];

interface Line {
  product: Product;
  quantity: number;
}

interface Shopper {
  customer: Actor;
  checkout: CheckoutApi;
  basket: BasketApi;
  lines: Line[];
  address: Address;
  card: Card;
  /** An address and a card saved before the chosen ones, when the case asked for them. */
  others: { address: Address; card: Card }[];
  delivery: { id: number; name: DeliveryMethod; price: number; eta: number };
  /** Items, the delivery price and the total the summary must show; no coupon, no promotion. */
  items: number;
  total: number;
}

/**
 * A customer of the case's own, with <PRODUCT> twice and <SECOND_PRODUCT> once in the basket and an
 * address and a card saved, all through `api/`. <SECOND_PRODUCT> is the most stocked product whose
 * price differs from <PRODUCT>'s, so each product and the quantity weigh on the
 * total. With `others`, an address and a card are saved before the chosen ones and another pair
 * after them, so the chosen ones are neither the first nor the newest in their lists.
 */
async function aShopper(
  actor: (role?: string, options?: { fresh?: boolean }) => Promise<Actor>,
  {
    address = anAddress(),
    card = aCard(),
    method = DELIVERY,
    others = false,
  }: { address?: Address; card?: Card; method?: DeliveryMethod; others?: boolean } = {},
): Promise<Shopper> {
  const customer = await actor('customer', { fresh: true });
  if (!customer.account) throw new Error('A fresh customer has an account.');
  const catalogue = new CatalogueApi(customer.api);
  const first = await catalogue.product(PRODUCT);
  // The next most stocked product whose price differs, so it does not run out either.
  const second = (await catalogue.stocked()).find(
    (p) => p.name !== PRODUCT && p.price !== first.price,
  );
  if (!second) throw new Error(`The catalogue has no product priced unlike ${PRODUCT}.`);
  const lines: Line[] = [
    { product: first, quantity: 2 },
    { product: second, quantity: 1 },
  ];
  const basket = await BasketApi.of(customer.api, customer.account);
  for (const { product, quantity } of lines) await basket.add(product.id, quantity);
  const checkout = new CheckoutApi(customer.api);
  const decoys: Shopper['others'] = [];
  const aDecoy = () => {
    let decoyCard = aCard();
    const taken = [card, ...decoys.map((d) => d.card)].map(lastFour);
    while (taken.includes(lastFour(decoyCard))) decoyCard = aCard();
    const decoy = { address: anAddress(), card: decoyCard };
    decoys.push(decoy);
    return decoy;
  };
  const save = async (pair: { address: Address; card: Card }) => {
    await checkout.addAddress(pair.address);
    await checkout.addCard(pair.card);
  };
  if (others) await save(aDecoy());
  await save({ address, card });
  if (others) await save(aDecoy());
  const delivery = (await checkout.deliveryMethods()).find((m) => m.name === method);
  if (!delivery) throw new Error(`The shop has no "${method}".`);
  const items = lines.reduce((sum, { product, quantity }) => sum + product.price * quantity, 0);
  return {
    customer,
    checkout,
    basket,
    lines,
    address,
    card,
    others: decoys,
    delivery: { ...delivery, name: method },
    items,
    total: items + delivery.price,
  };
}

/** From the basket through the address step, as the customer takes them. */
async function walkToDelivery(page: Page, shopper: Shopper): Promise<void> {
  const basket = new BasketPage(page);
  await basket.open();
  await expect(basket.row(PRODUCT)).toBeVisible();
  await basket.checkout().click();
  await expect(new AddressSelectPage(page).heading()).toBeVisible();
  await chooseSavedAddress(page, shopper.address.fullName);
  await expect(new DeliveryPage(page).heading()).toBeVisible();
}

/** From the basket through the address and delivery steps, as the customer takes them. */
async function walkToPayment(page: Page, shopper: Shopper): Promise<void> {
  await walkToDelivery(page, shopper);
  await chooseDelivery(page, shopper.delivery.name);
  await expect(new PaymentPage(page).heading()).toBeVisible();
}

/** The whole walk to the summary, waiting for its product rows: it shows 0.00¤ before them. */
async function walkToSummary(page: Page, shopper: Shopper): Promise<OrderSummaryPage> {
  await walkToPayment(page, shopper);
  await chooseSavedCard(page, shopper.card);
  const summary = new OrderSummaryPage(page);
  for (const { product } of shopper.lines)
    await expect(summary.product(product.name)).toBeVisible();
  return summary;
}

/**
 * Place the order from the summary and wait for the completion page; returns the order id. The
 * checkout's answer can take seconds while other runs use the shop, so the case waits for it
 * before it looks for the move to the completion page.
 */
async function placeOrder(page: Page, summary: OrderSummaryPage): Promise<string> {
  const answered = summary.orderAnswered();
  await summary.placeOrder().click();
  await answered;
  await expect(page).toHaveURL(/#\/order-completion\/[^/?]+$/);
  const completion = new OrderCompletionPage(page);
  await expect(completion.heading()).toBeVisible();
  return completion.orderId();
}

/** Place the shopper's order through the API, for a case about what follows it. */
async function orderThroughApi({ checkout, basket, delivery }: Shopper): Promise<string> {
  const [address] = await checkout.addresses();
  const [card] = await checkout.cards();
  if (!address || !card) throw new Error('The shopper has a saved address and a saved card.');
  return checkout.placeOrder(basket.basketId, {
    addressId: address.id,
    paymentId: card.id,
    deliveryMethodId: delivery.id,
  });
}

/**
 * Tab to a control, then check that it has focus and shows it. Angular Material draws the focus on
 * a wrapper or a pseudo-element, so the check compares how `region` is drawn, never the control's
 * own style: a radio's native input is not what a customer sees.
 */
async function tabTo(page: Page, name: string, control: Locator, region = control): Promise<void> {
  const stops = await tabUntil(page, control, TAB_LIMIT);
  await expect(control, `Tab reaches ${name}, past ${JSON.stringify(stops)}`).toBeFocused();
  expect(await focusChangesRendering(control, region), `${name} shows its focus`).toBe(true);
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test.describe('the checkout writes', () => {
  test.beforeEach(({ qa }) => {
    test.skip(
      !qa.allowWrites,
      'the case adds products, an address, a card or an order; allow_writes is false',
    );
    // A case walks four or five checkout pages after arranging through the API.
    test.slow();
  });

  test('TC-CHECKOUT-12 with <PRODUCT> twice and <SECOND_PRODUCT> once and Fast Delivery, the summary shows the chosen address, the card ending in <LAST4>, both rows, and Items, Delivery 0.50¤, Promotion and a Total that is their sum @regression', async ({
    actor,
  }) => {
    // The chosen address and card sit between two others of each, so a summary that showed the
    // first or the newest one saved, rather than the one chosen, would not pass.
    const shopper = await aShopper(actor, { others: true });
    if (shopper.others.length !== 2) throw new Error('The shopper was asked for two others.');
    const { page } = shopper.customer;
    const summary = await walkToSummary(page, shopper);

    await test.step('the summary shows the chosen address and the card ending', async () => {
      await expect(summary.shows(shopper.address.fullName)).toBeVisible();
      await expect(summary.shows(shopper.address.city)).toBeVisible();
      await expect(summary.shows(`Card ending in ${lastFour(shopper.card)}`)).toBeVisible();
      for (const other of shopper.others) {
        await expect(summary.shows(other.address.fullName)).toBeHidden();
        await expect(summary.shows(`Card ending in ${lastFour(other.card)}`)).toBeHidden();
      }
    });

    await test.step('the summary has a row per product with its quantity and price', async () => {
      for (const { product, quantity } of shopper.lines) {
        await expect(summary.productQuantity(product.name)).toHaveText(String(quantity));
        await expect(summary.productPrice(product.name)).toHaveText(money(product.price));
      }
    });

    await test.step('the amounts add up to the total', async () => {
      expect(money(shopper.delivery.price)).toBe('0.50¤');
      await expect(summary.amount('Items')).toHaveText(money(shopper.items));
      await expect(summary.amount('Delivery')).toHaveText(money(shopper.delivery.price));
      await expect(summary.amount('Promotion')).toHaveText(money(0));
      await expect(summary.amount('Total Price')).toHaveText(money(shopper.total));
    });
  });

  test('TC-CHECKOUT-13 placing the order opens /#/order-completion/<ORDER_ID> with "Thank you for your purchase!", the products, the totals and the delivery days, and empties the basket on the page and in the API @smoke', async ({
    actor,
  }) => {
    const shopper = await aShopper(actor);
    const { page } = shopper.customer;
    const summary = await walkToSummary(page, shopper);
    const completion = new OrderCompletionPage(page);

    const orderId = await test.step('place the order', () => placeOrder(page, summary));

    await test.step('the completion page shows the products, totals and delivery days', async () => {
      for (const { product } of shopper.lines) {
        await expect(completion.product(product.name)).toBeVisible();
      }
      await expect(completion.amount('Items')).toHaveText(money(shopper.items));
      await expect(completion.amount('Delivery')).toHaveText(money(shopper.delivery.price));
      await expect(completion.amount('Total Price')).toHaveText(money(shopper.total));
      await expect(completion.deliveryDays()).toHaveText(
        `Your order will be delivered in ${shopper.delivery.eta} days.`,
      );
    });

    await test.step('the basket is empty on the page and in the API', async () => {
      await expect(new Toolbar(page).basketButton()).toHaveText(/(?:^|\D)0$/);
      expect(await shopper.basket.lines()).toEqual([]);
    });

    await test.step('the API holds the order the page names', async () => {
      const order = (await shopper.checkout.orders()).find((o) => o.orderId === orderId);
      expect(order).toMatchObject({
        totalPrice: shopper.total,
        deliveryPrice: shopper.delivery.price,
      });
    });
  });

  test('TC-CHECKOUT-14 the placed order is in the order history with <ORDER_ID>, its total, "In Transit" and its products, and Track Orders shows its products and expected delivery @regression', async ({
    actor,
  }) => {
    const shopper = await aShopper(actor);
    const { page } = shopper.customer;
    const orderId = await placeOrder(page, await walkToSummary(page, shopper));
    const history = new OrderHistoryPage(page);
    const track = new TrackResultPage(page);

    await test.step('Track Orders opens the tracking of the order', async () => {
      await new OrderCompletionPage(page).trackOrders().click();
      await expect(page).toHaveURL(
        new RegExp(`#/track-result/new\\?id=${escape(encodeURIComponent(orderId))}$`),
      );
      await expect(track.heading(orderId)).toBeVisible();
      await expect(track.expectedDelivery()).toBeVisible();
      await expect(track.expectedDeliveryDays()).toHaveText(
        new RegExp(`^${shopper.delivery.eta} Days?$`),
      );
      for (const { product } of shopper.lines) {
        await expect(track.product(product.name)).toBeVisible();
      }
    });

    await test.step('the order history lists the order', async () => {
      await history.open();
      await expect(history.order(orderId)).toBeVisible();
      await expect(history.shows(money(shopper.total))).toBeVisible();
      await expect(history.shows('In Transit')).toBeVisible();
      for (const { product } of shopper.lines) {
        await expect(history.product(product.name)).toBeVisible();
      }
    });

    await test.step('the API holds the order with the total the history shows', async () => {
      const orders = await shopper.checkout.orders();
      expect(orders.map((o) => o.orderId)).toEqual([orderId]);
      expect(orders[0]).toMatchObject({ totalPrice: shopper.total });
    });
  });

  test('TC-CHECKOUT-16 /#/order-summary opened directly, without an address, a delivery method and a card, refuses to place the order and no order is created @regression @security @known-gap', async ({
    actor,
  }) => {
    const customer = await actor('customer', { fresh: true });
    if (!customer.account) throw new Error('A fresh customer has an account.');
    const product = await new CatalogueApi(customer.api).product(PRODUCT);
    const basket = await BasketApi.of(customer.api, customer.account);
    await basket.add(product.id);
    const checkout = new CheckoutApi(customer.api);
    const { page } = customer;
    const summary = new OrderSummaryPage(page);
    await summary.open();
    await expect(summary.product(PRODUCT)).toBeVisible();
    await expect(summary.placeOrder()).toBeEnabled();
    // The API must refuse: a fix that only stops the page from sending the request leaves the
    // checkout open to anyone calling it, so this case then times out after the arm and stays red.
    const answered = summary.orderAnswered();

    test.fail(
      true,
      await knownGap(
        'LOCAL-7',
        'the summary opened directly places an order with no address, delivery method or card',
      ),
    );
    await summary.placeOrder().click();
    const status = await answered;
    const orders: Order[] = await checkout.orders();
    expect(orders, 'no order without an address, a delivery method and a card').toEqual([]);
    expect(status, 'the checkout answers with a refusal').toBeGreaterThanOrEqual(400);
    expect(await basket.lines(), 'the basket keeps its product').toHaveLength(1);
    await expect(page).toHaveURL(/#\/order-summary$/);
  });

  test('TC-CHECKOUT-21 no checkout step scrolls sideways with <LONG_ADDRESS> and a long holder name, and the summary rows keep name, quantity and price visible @regression @responsive @known-gap', async ({
    actor,
  }) => {
    // Polled: the shell measures a few pixels wider for a moment while a step settles.
    const noSidewaysScroll = (page: Page, step: string) =>
      expect
        .poll(() => horizontalOverflow(page), { message: `sideways scroll on ${step}` })
        .toBe(0);
    const street = longStreet();
    const holder = longHolderName(80);
    const shopper = await aShopper(actor, {
      address: anAddress({ streetAddress: street }),
      card: aCard({ fullName: holder }),
    });
    const { page } = shopper.customer;
    const basket = new BasketPage(page);
    const select = new AddressSelectPage(page);
    const delivery = new DeliveryPage(page);
    const payment = new PaymentPage(page);
    const summary = new OrderSummaryPage(page);

    await test.step('the address step lists the long address without scrolling sideways', async () => {
      // The page shows an empty basket until its answer, which took over 5 s under load (2026-11-06).
      const contents = basket.contentsLoaded();
      await basket.open();
      await contents;
      await expect(basket.row(PRODUCT)).toBeVisible();
      await basket.checkout().click();
      await expect(select.address(shopper.address.fullName)).toContainText(street);
      await noSidewaysScroll(page, 'the address step');
    });

    // Read here and on the summary, and asserted at the end, behind the arm, so the steps after
    // each one still run.
    const deliveryOverflow =
      await test.step('the delivery step repeats the long address', async () => {
        await chooseSavedAddress(page, shopper.address.fullName);
        await expect(delivery.deliveryAddress(street)).toBeVisible();
        return settledHorizontalOverflow(page);
      });

    await test.step('the payment step lists the long holder name without scrolling sideways', async () => {
      await chooseDelivery(page, shopper.delivery.name);
      await expect(payment.card(lastFour(shopper.card))).toContainText(holder);
      await noSidewaysScroll(page, 'the payment step');
    });

    const summaryOverflow =
      await test.step('the summary shows the long address and whole rows', async () => {
        await chooseSavedCard(page, shopper.card);
        for (const { product } of shopper.lines) {
          // The rows come with the basket's answer, which took 5.4 s under load (2026-11-06).
          await expect(summary.product(product.name)).toBeVisible({ timeout: 15_000 });
        }
        await expect(summary.shows(street)).toBeVisible();
        const overflow = await settledHorizontalOverflow(page);
        for (const { product, quantity } of shopper.lines) {
          const row = summary.product(product.name);
          const quantityCell = summary.productQuantity(product.name);
          const priceCell = summary.productPrice(product.name);
          // Brought into view first: on a short screen a row can sit below the fold, which is not
          // what the case is about; a cell pushed out sideways stays out of the viewport.
          await row.scrollIntoViewIfNeeded();
          await expect(row).toContainText(product.name);
          await expect(quantityCell).toHaveText(String(quantity));
          await expect(quantityCell).toBeInViewport();
          await expect(priceCell).toHaveText(money(product.price));
          await expect(priceCell).toBeInViewport();
          expect(await clippedText(row), `text cut off in the row of ${product.name}`).toEqual([]);
        }
        return overflow;
      });

    test.fail(
      true,
      await knownGap('LOCAL-38', 'a long address line runs out of its card and scrolls sideways'),
    );
    expect({ deliveryOverflow, summaryOverflow }, 'sideways scroll on the two steps').toEqual({
      deliveryOverflow: 0,
      summaryOverflow: 0,
    });
  });

  // The loading cases hold an answer for HOLD; each check looks for CHECK, well inside it, so what
  // it sees is the page before the answer, never the page after it. The elapsed time is checked
  // too: a check that ended after the hold would have looked at the page with its data.
  const HOLD = 10_000;
  const CHECK = 1_500;

  test('TC-CHECKOUT-22 a slow basket answer never shows a 0.00¤ total or an empty products table on the summary @regression @perf @known-gap', async ({
    actor,
  }) => {
    // Standard Delivery is free: before the basket answers, the total the page shows is the
    // delivery price alone, so with this method the wrong state is the 0.00¤ the case names.
    const shopper = await aShopper(actor, { method: 'Standard Delivery' });
    const { page } = shopper.customer;
    const summary = new OrderSummaryPage(page);
    await walkToPayment(page, shopper);
    await slowBasket(page, HOLD);
    const basketAsked = Date.now();
    await chooseSavedCard(page, shopper.card);
    // The address comes from its own answer, which is not held: the summary is on the screen.
    await expect(summary.shows(shopper.address.fullName)).toBeVisible();

    test.fail(
      true,
      await knownGap(
        'LOCAL-13',
        'the summary shows 0.00¤ and an empty table before the basket answers',
      ),
    );
    await test.step('while the basket is held, the summary shows no 0.00¤ total and no empty table', async () => {
      await expect
        .soft(summary.amount('Total Price'), 'a 0.00¤ total before the basket answers')
        .not.toHaveText(money(0), { timeout: CHECK });
      await expect
        .soft(summary.emptyProductsTable(), 'an empty products table before the basket answers')
        .toBeHidden({ timeout: CHECK });
      expect(Date.now() - basketAsked, 'the checks ran while the basket was held').toBeLessThan(
        HOLD,
      );
    });

    await test.step('once the basket answers, the summary shows the products and the total', async () => {
      await expect(summary.productRows()).toHaveCount(shopper.lines.length, { timeout: HOLD });
      await expect(summary.amount('Total Price')).toHaveText(money(shopper.total));
    });
  });

  test('TC-CHECKOUT-30 a slow order answer never shows raw template text or a 0.00¤ total on the completion page @regression @perf @known-gap', async ({
    actor,
  }) => {
    const shopper = await aShopper(actor, { method: 'Standard Delivery' });
    const { page } = shopper.customer;
    const summary = await walkToSummary(page, shopper);
    const completion = new OrderCompletionPage(page);
    await expect(summary.amount('Total Price')).toHaveText(money(shopper.total));
    await slowOrder(page, HOLD);
    const answered = summary.orderAnswered();
    await summary.placeOrder().click();
    await answered;
    const orderAsked = Date.now();
    await expect(page).toHaveURL(/#\/order-completion\/[^/?]+$/);
    await expect(completion.heading()).toBeVisible();

    test.fail(
      true,
      await knownGap(
        'LOCAL-13',
        'the completion page shows {{bonus}} and 0.00¤ before the order answers',
      ),
    );
    await test.step('while the order is held, the completion page shows no template text and no 0.00¤ total', async () => {
      await expect
        .soft(completion.templateText(), 'raw template text before the order answers')
        .toBeHidden({ timeout: CHECK });
      await expect
        .soft(completion.amount('Total Price'), 'a 0.00¤ total before the order answers')
        .not.toHaveText(money(0), { timeout: CHECK });
      expect(Date.now() - orderAsked, 'the checks ran while the order was held').toBeLessThan(HOLD);
    });

    await test.step('once the order answers, the completion page shows its total', async () => {
      await expect(completion.amount('Total Price')).toHaveText(money(shopper.total), {
        timeout: HOLD,
      });
      await expect(completion.templateText()).toBeHidden();
    });
  });

  test('TC-CHECKOUT-24 every product image of the summary loads @regression @layout', async ({
    actor,
  }) => {
    const shopper = await aShopper(actor);
    const summary = await walkToSummary(shopper.customer.page, shopper);
    for (const { product } of shopper.lines) {
      const image = summary.productImage(product.name);
      await expect(image).toBeVisible();
      await expect(image).toHaveJSProperty('complete', true);
      await expect(image, `the image of ${product.name} has no pixels`).not.toHaveJSProperty(
        'naturalWidth',
        0,
      );
    }
  });

  test("TC-CHECKOUT-27 each step button's accessible name contains the text it shows and names the step it leads to @regression @a11y @known-gap", async ({
    actor,
  }) => {
    const shopper = await aShopper(actor);
    const { page } = shopper.customer;
    const select = new AddressSelectPage(page);
    const delivery = new DeliveryPage(page);
    const payment = new PaymentPage(page);
    const summary = new OrderSummaryPage(page);
    // Each button is found by the text it shows, so the case keeps finding it once LOCAL-10 renames
    // it, and reads as closed then.
    const steps = [
      {
        step: 'address',
        open: () => select.open(),
        button: select.continueByText(),
        shows: 'Continue',
        leadsTo: /delivery/i,
      },
      {
        step: 'delivery',
        open: () => delivery.open(),
        button: delivery.continueByText(),
        shows: 'Continue',
        leadsTo: /payment/i,
      },
      {
        step: 'payment',
        open: () => payment.open(),
        button: payment.continueByText(),
        shows: 'Continue',
        leadsTo: /review|summary/i,
      },
      {
        step: 'summary',
        open: () => summary.open(),
        button: summary.placeOrderByText(),
        shows: 'Place your order and pay',
        leadsTo: /order|purchase/i,
      },
    ];

    await test.step('walk the steps; each button shows its text', async () => {
      await walkToSummary(page, shopper);
    });
    for (const { step, open, button, shows } of steps) {
      await test.step(`the ${step} step's button shows "${shows}"`, async () => {
        await open();
        await expect(button).toBeVisible();
        await expect(button).toContainText(shows);
      });
    }

    test.fail(
      true,
      await knownGap(
        'LOCAL-10',
        'the step buttons are named apart from their text, two after the wrong step',
      ),
    );
    for (const { step, open, button, shows, leadsTo } of steps) {
      await test.step(`the ${step} step's button is named with its text and its next step`, async () => {
        await open();
        await expect.soft(button).toHaveAccessibleName(new RegExp(escape(shows)));
        await expect.soft(button).toHaveAccessibleName(leadsTo);
      });
    }
  });

  test('TC-CHECKOUT-05 an address without a State shows no empty slot in its line on the list and the summary @regression @content @known-gap', async ({
    actor,
  }) => {
    const address = anAddress({ state: undefined });
    const shopper = await aShopper(actor, { address });
    const { page } = shopper.customer;
    const select = new AddressSelectPage(page);
    const summary = await walkToSummary(page, shopper);
    await expect(summary.shows(address.streetAddress)).toBeVisible();

    test.fail(true, await knownGap('LOCAL-12', 'an address without a State shows an empty slot'));
    await expect.soft(summary.shows(/,\s*,/), 'the summary shows no empty slot').toHaveCount(0);
    const loaded = select.loaded();
    await select.open();
    await loaded;
    await expect
      .soft(select.address(address.fullName), 'the list shows no empty slot')
      .not.toContainText(/,\s*,/);
  });

  test('TC-CHECKOUT-09 the delivery step lists One Day Delivery 0.99¤ 1 day, Fast Delivery 0.50¤ 3 days and Standard Delivery 0.00¤ 5 days, and Continue stays disabled until one is chosen @regression', async ({
    actor,
  }) => {
    const shopper = await aShopper(actor);
    const { page } = shopper.customer;
    const delivery = new DeliveryPage(page);

    await walkToDelivery(page, shopper);

    await expect(delivery.methods()).toHaveCount(METHODS.length);
    for (const { name, price, days } of METHODS) {
      await expect(delivery.method(name)).toContainText(price);
      await expect(delivery.method(name)).toContainText(days);
    }
    await expect(delivery.proceed()).toBeDisabled();
    await delivery.choose('Standard Delivery');
    await expect(delivery.proceed()).toBeEnabled();
  });

  test('TC-CHECKOUT-15 a customer with no orders sees "You have not placed any orders yet." in the order history @regression', async ({
    actor,
  }) => {
    const customer = await actor('customer', { fresh: true });
    expect(await new CheckoutApi(customer.api).orders()).toEqual([]);
    const history = new OrderHistoryPage(customer.page);

    await history.open();

    await expect(history.empty()).toBeVisible();
    await expect(history.track()).toHaveCount(0);
  });

  test.describe('the tracking refused', () => {
    // The refusal is what the case is about: once LOCAL-8 is fixed the page's own request is
    // refused, and the guard keeps watching everything else.
    test.use({
      pageHealth: {
        allowConsole: [/\/rest\/track-order\//],
        allowRequests: [/\/rest\/track-order\//],
      },
    });

    test("TC-CHECKOUT-18 without a session, the tracking of a customer's order is refused by the API and the tracking page shows none of its products @regression @security @known-gap", async ({
      actor,
    }) => {
      const shopper = await aShopper(actor);
      const orderId = await orderThroughApi(shopper);
      // The entry state: the order exists and its owner reads it, so a refusal below is about the
      // session and not about an order that is not there.
      const own = await shopper.checkout.track(orderId);
      expect(own.status).toBe(200);
      expect(own.orders.map((o) => o.orderId)).toEqual([orderId]);
      const anonymous = await actor('anonymous');
      const track = new TrackResultPage(anonymous.page);

      test.fail(true, await knownGap('LOCAL-8', 'anyone with an order id reads the order'));
      const answer = await new CheckoutApi(anonymous.api).track(orderId);
      expect.soft(answer.status, 'the API refuses the tracking').toBeGreaterThanOrEqual(400);
      expect.soft(answer.orders, 'the API gives no order').toEqual([]);
      const answered = track.answered();
      await track.open(orderId);
      expect.soft(await answered, 'the page is refused too').toBeGreaterThanOrEqual(400);
      for (const { product } of shopper.lines)
        await expect.soft(track.product(product.name), 'the page shows no product').toBeHidden();
    });
  });

  test.describe('a step opened directly', () => {
    // Opened directly, the payment step asks for a delivery method nobody chose and the shop logs
    // the refusal. The case is about the radios; it walks no step, so that nothing else depends on
    // one, and the guard keeps watching everything else.
    test.use({
      pageHealth: {
        allowConsole: [/\/api\/Deliverys\/null/],
        allowRequests: [/\/api\/Deliverys\/null/],
      },
    });

    test('TC-CHECKOUT-26 the radios of the address, delivery and card tables are named after their rows @regression @a11y @known-gap', async ({
      actor,
    }) => {
      const shopper = await aShopper(actor);
      const { page } = shopper.customer;
      const select = new AddressSelectPage(page);
      const delivery = new DeliveryPage(page);
      const payment = new PaymentPage(page);
      const { fullName } = shopper.address;
      const card = lastFour(shopper.card);
      const steps = [
        {
          open: () => select.open(),
          radios: [{ inRow: select.radio(fullName), named: select.radioNamed(fullName) }],
        },
        {
          open: () => delivery.open(),
          radios: METHODS.map(({ name }) => ({
            inRow: delivery.radio(name),
            named: delivery.radioNamed(name),
          })),
        },
        {
          open: () => payment.open(),
          radios: [{ inRow: payment.radio(card), named: payment.radioNamed(card) }],
        },
      ];
      // Every row has its radio, so a missing name below is about the name and not about the row.
      for (const { open, radios } of steps) {
        await open();
        for (const { inRow } of radios) await expect(inRow).toBeVisible();
      }

      test.fail(
        true,
        await knownGap('LOCAL-9', 'the radios of the checkout have no accessible name'),
      );
      for (const { open, radios } of steps) {
        await open();
        for (const { named } of radios) await expect.soft(named).toBeVisible();
      }
    });
  });

  test('TC-CHECKOUT-28 the summary and the order history each have a heading for their content @regression @a11y @known-gap', async ({
    actor,
  }) => {
    const shopper = await aShopper(actor);
    const { page } = shopper.customer;
    const history = new OrderHistoryPage(page);
    const orderId = await orderThroughApi(shopper);
    await history.open();
    await expect(history.order(orderId)).toBeVisible();
    await expect(history.title()).toBeVisible();
    // The order emptied the basket; the summary needs its products back.
    for (const { product, quantity } of shopper.lines)
      await shopper.basket.add(product.id, quantity);
    const summary = await walkToSummary(page, shopper);
    await expect(summary.title()).toBeVisible();

    test.fail(true, await knownGap('LOCAL-11', 'neither page has a heading for its content'));
    await expect.soft(summary.heading(), 'the summary has a heading').toBeVisible();
    await history.open();
    await expect.soft(history.heading(), 'the order history has a heading').toBeVisible();
  });

  test('TC-CHECKOUT-29 the keyboard alone completes the checkout, the focus visible on each control used, no axe violation beyond the baseline @regression @a11y', async ({
    a11y,
    actor,
  }) => {
    const method = 'One Day Delivery';
    const shopper = await aShopper(actor, { method });
    const { page } = shopper.customer;
    const { fullName } = shopper.address;
    const card = lastFour(shopper.card);
    const basket = new BasketPage(page);
    const select = new AddressSelectPage(page);
    const delivery = new DeliveryPage(page);
    const payment = new PaymentPage(page);
    const summary = new OrderSummaryPage(page);
    const completion = new OrderCompletionPage(page);

    await test.step('the basket', async () => {
      const contents = basket.contentsLoaded();
      await basket.open();
      await contents;
      await expect(basket.row(PRODUCT)).toBeVisible();
      await a11y.expectNoNewViolations(page);
      const addresses = select.loaded();
      await tabTo(page, 'Checkout', basket.checkout());
      await page.keyboard.press('Enter');
      await addresses;
    });

    await test.step('the address step', async () => {
      await expect(select.heading()).toBeVisible();
      await expect(select.address(fullName)).toBeVisible();
      await a11y.expectNoNewViolations(page);
      await tabTo(
        page,
        'the radio of the address',
        select.radio(fullName),
        select.address(fullName),
      );
      await page.keyboard.press('Space');
      await expect(select.proceed()).toBeEnabled();
      await tabTo(page, 'Continue on the address step', select.proceed());
      await page.keyboard.press('Enter');
    });

    await test.step('the delivery step', async () => {
      await expect(delivery.heading()).toBeVisible();
      await expect(delivery.method(method)).toBeVisible();
      await a11y.expectNoNewViolations(page);
      await tabTo(page, 'the radio of the method', delivery.radio(method), delivery.method(method));
      await page.keyboard.press('Space');
      await expect(delivery.proceed()).toBeEnabled();
      await tabTo(page, 'Continue on the delivery step', delivery.proceed());
      await page.keyboard.press('Enter');
    });

    await test.step('the payment step', async () => {
      await expect(payment.heading()).toBeVisible();
      await expect(payment.card(card)).toBeVisible();
      await a11y.expectNoNewViolations(page);
      await tabTo(page, 'the radio of the card', payment.radio(card), payment.card(card));
      await page.keyboard.press('Space');
      await expect(payment.proceed()).toBeEnabled();
      await tabTo(page, 'Continue on the payment step', payment.proceed());
      await page.keyboard.press('Enter');
    });

    let orderId = '';
    await test.step('the summary', async () => {
      for (const { product } of shopper.lines)
        await expect(summary.product(product.name)).toBeVisible();
      await a11y.expectNoNewViolations(page);
      await tabTo(page, 'Place your order and pay', summary.placeOrder());
      const answered = summary.orderAnswered();
      await page.keyboard.press('Enter');
      expect(await answered).toBe(200);
      await expect(completion.heading()).toBeVisible();
      orderId = completion.orderId();
    });

    await test.step('the completion page, and the API holds the order', async () => {
      for (const { product } of shopper.lines)
        await expect(completion.product(product.name)).toBeVisible();
      await a11y.expectNoNewViolations(page);
      const orders = await shopper.checkout.orders();
      expect(orders.map((o) => o.orderId)).toEqual([orderId]);
      // What the keyboard chose reached the order: the shop also places one without it (LOCAL-7).
      expect(orders[0]).toMatchObject({
        totalPrice: shopper.total,
        deliveryPrice: shopper.delivery.price,
      });
      expect(orders[0]?.addressId).toBeTruthy();
      expect(orders[0]?.paymentId).toBeTruthy();
    });
  });
});

test('TC-CHECKOUT-17 without a session, each checkout route opens the login and shows no checkout @regression @security @known-gap', async ({
  actor,
}) => {
  // Five routes, each checked to the end: while LOCAL-3 is open, each soft check waits its full
  // timeout, which is more than the default test time.
  test.slow();
  const { page } = await actor('anonymous');
  const login = new LoginPage(page);
  const routes = [
    {
      route: '/#/address/select',
      open: () => new AddressSelectPage(page).open(),
      checkout: new AddressSelectPage(page).heading(),
    },
    {
      route: '/#/address/create',
      open: () => new AddressFormPage(page).open(),
      checkout: new AddressFormPage(page).heading(),
    },
    {
      route: '/#/delivery-method',
      open: () => new DeliveryPage(page).open(),
      checkout: new DeliveryPage(page).heading(),
    },
    {
      route: '/#/payment/shop',
      open: () => new PaymentPage(page).open(),
      checkout: new PaymentPage(page).heading(),
    },
    {
      route: '/#/order-summary',
      open: () => new OrderSummaryPage(page).open(),
      // Found by its text, so the check still means something once LOCAL-10 renames the button.
      checkout: new OrderSummaryPage(page).placeOrderByText(),
    },
  ];

  test.fail(true, await knownGap('LOCAL-3', 'the checkout routes open without a session'));
  for (const { route, open, checkout } of routes) {
    await test.step(`${route} opens the login`, async () => {
      await open();
      await expect.soft(page, `${route} sends to the login`).toHaveURL(/#\/login$/);
      await expect.soft(login.email()).toBeVisible();
      await expect.soft(checkout, `${route} shows no checkout`).toBeHidden();
    });
  }
});
