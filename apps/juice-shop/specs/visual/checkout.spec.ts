// Visual: the order completion page on every device project, compared with baselines rendered in
// the pinned image (npm run lanes:visual). Every other run leaves this file's cases out. The order
// is placed through `api/`, since the case is about the page that follows it. The products and the
// address are the same on every run, and the page shows neither the order id (it is only in the
// Track Orders link's address) nor a date, so nothing is masked.

import { BasketApi } from '../../api/basket-api';
import { CatalogueApi } from '../../api/catalogue-api';
import { CheckoutApi } from '../../api/checkout-api';
import { anAddress } from '../../builders/address-builder';
import { aCard } from '../../builders/card-builder';
import { expect, test } from '../../fixtures';
import { OrderCompletionPage } from '../../pages/order-completion-page';

const LINES = [
  { name: 'Apple Juice (1000ml)', quantity: 2 },
  { name: 'Banana Juice (1000ml)', quantity: 1 },
];
const DELIVERY = 'Standard Delivery';
// Made up and the same on every run, so the address block renders alike.
const ADDRESS = anAddress({
  fullName: 'Test Customer',
  mobileNum: 5_550_000_000,
  zipCode: '10001',
  streetAddress: '1 Example Street',
  city: 'Sample City',
});

test('TC-CHECKOUT-25 the completion page looks as designed @regression @visual @layout', async ({
  actor,
  qa,
  visual,
}) => {
  test.skip(
    !qa.allowWrites,
    'the case creates an account and places an order; allow_writes is false',
  );
  const customer = await actor('customer', { fresh: true });
  if (!customer.account) throw new Error('A fresh customer has an account.');
  const catalogue = new CatalogueApi(customer.api);
  const basket = await BasketApi.of(customer.api, customer.account);
  let items = 0;
  for (const { name, quantity } of LINES) {
    const product = await catalogue.product(name);
    await basket.add(product.id, quantity);
    items += product.price * quantity;
  }
  const checkout = new CheckoutApi(customer.api);
  const address = await checkout.addAddress(ADDRESS);
  const card = await checkout.addCard(aCard());
  const delivery = (await checkout.deliveryMethods()).find((m) => m.name === DELIVERY);
  if (!delivery) throw new Error(`The shop has no "${DELIVERY}".`);
  const orderId = await checkout.placeOrder(basket.basketId, {
    addressId: address.id,
    paymentId: card.id,
    deliveryMethodId: delivery.id,
  });

  const completion = new OrderCompletionPage(customer.page);
  await completion.open(orderId);
  await expect(completion.heading()).toBeVisible();
  for (const { name } of LINES) await expect(completion.product(name)).toBeVisible();
  await expect(completion.deliveryDays()).toBeVisible();
  await expect(completion.shows(ADDRESS.streetAddress)).toBeVisible();
  // The screenshot tolerates a few changed lines, so the total is pinned here as text.
  await expect(completion.amount('Total Price')).toHaveText(
    `${(items + delivery.price).toFixed(2)}¤`,
  );
  await visual.expectToMatch(customer.page, 'order-completion.png', [], { wholePage: true });
});
