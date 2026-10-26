// The checkout cases about the order itself (registry/checkout.md): the summary, placing the order,
// the history and tracking, the routes without a session, the summary's layout and loading, and the
// step buttons' names. Every case that writes takes a customer of its own, since it adds addresses,
// cards and orders that stay until the container restarts; the products, the address and the card
// go in through `api/`, and the steps the case is about are walked through the UI.

import type { Page } from '@playwright/test';
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
import { horizontalOverflow, clippedText } from '../../../../helpers/layout';
import { knownGap } from '../../../../helpers/case-meta';
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
  delivery: { name: DeliveryMethod; price: number; eta: number };
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

/** From the basket through the address and delivery steps, as the customer takes them. */
async function walkToPayment(page: Page, shopper: Shopper): Promise<void> {
  const basket = new BasketPage(page);
  await basket.open();
  await expect(basket.row(PRODUCT)).toBeVisible();
  await basket.checkout().click();
  await expect(new AddressSelectPage(page).heading()).toBeVisible();
  await chooseSavedAddress(page, shopper.address.fullName);
  await expect(new DeliveryPage(page).heading()).toBeVisible();
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

  test('TC-CHECKOUT-21 no checkout step scrolls sideways with <LONG_ADDRESS> and a long holder name, and the summary rows keep name, quantity and price visible @regression @responsive', async ({
    actor,
  }) => {
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
      await basket.open();
      await expect(basket.row(PRODUCT)).toBeVisible();
      await basket.checkout().click();
      await expect(select.address(shopper.address.fullName)).toContainText(street);
      expect(await horizontalOverflow(page), 'sideways scroll on the address step').toBe(0);
    });

    await test.step('the delivery step repeats the long address without scrolling sideways', async () => {
      await chooseSavedAddress(page, shopper.address.fullName);
      await expect(delivery.deliveryAddress(street)).toBeVisible();
      expect(await horizontalOverflow(page), 'sideways scroll on the delivery step').toBe(0);
    });

    await test.step('the payment step lists the long holder name without scrolling sideways', async () => {
      await chooseDelivery(page, shopper.delivery.name);
      await expect(payment.card(lastFour(shopper.card))).toContainText(holder);
      expect(await horizontalOverflow(page), 'sideways scroll on the payment step').toBe(0);
    });

    await test.step('the summary shows the long address and whole rows without scrolling sideways', async () => {
      await chooseSavedCard(page, shopper.card);
      for (const { product } of shopper.lines) {
        await expect(summary.product(product.name)).toBeVisible();
      }
      await expect(summary.shows(street)).toBeVisible();
      expect(await horizontalOverflow(page), 'sideways scroll on the summary').toBe(0);
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
