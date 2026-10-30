// The destructive basket case (registry/basket.md, TC-BASKET-24): a product bought out, then
// refused. Ordering the whole stock leaves the product sold out for every other case and person
// until the container restarts, so the case lives alone in this file, only the destructive lane
// (npm run lanes:destructive) selects it, and the lane runs the pack's recovery after it: a
// restart, which gives the stock back.

import { BasketApi } from '../../api/basket-api';
import { CatalogueApi } from '../../api/catalogue-api';
import { CheckoutApi } from '../../api/checkout-api';
import { anAddress } from '../../builders/address-builder';
import { aCard } from '../../builders/card-builder';
import { expect, test } from '../../fixtures';
import { SearchPage } from '../../pages/search-page';

const OUT_OF_STOCK = 'We are out of stock! Sorry for the inconvenience.';

test('TC-BASKET-24 once the whole stock of <LOW_STOCK_PRODUCT> is ordered, adding it from the search page says "We are out of stock! Sorry for the inconvenience." and the basket stays empty @regression @destructive', async ({
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case orders a product out of stock; allow_writes is false');
  const buyer = await actor('customer', { fresh: true });
  const account = buyer.account;
  if (!account) throw new Error('A fresh customer has an account.');
  const catalogue = new CatalogueApi(buyer.api);
  // <LOW_STOCK_PRODUCT>: no limit per customer, so one order can take the whole stock.
  const product = (await catalogue.stocked()).filter((p) => p.stock > 0).at(-1);
  if (!product) throw new Error('No product without a limit has stock left.');

  await test.step('another customer orders the whole stock', async () => {
    const basket = await BasketApi.of(buyer.api, account);
    await basket.add(product.id, product.stock);
    const checkout = new CheckoutApi(buyer.api);
    const address = await checkout.addAddress(anAddress());
    const card = await checkout.addCard(aCard());
    const [delivery] = await checkout.deliveryMethods();
    if (!delivery) throw new Error('The shop has no delivery method.');
    await checkout.placeOrder(basket.basketId, {
      addressId: address.id,
      paymentId: card.id,
      deliveryMethodId: delivery.id,
    });
    // The shop answers the order before its stock update is committed, so the read retries.
    await expect.poll(async () => (await catalogue.quantity(product.id)).stock).toBe(0);
  });

  const customer = await actor('customer', { fresh: true });
  if (!customer.account) throw new Error('A fresh customer has an account.');
  const basket = await BasketApi.of(customer.api, customer.account);
  const search = new SearchPage(customer.page);
  await search.open(product.name);
  await expect(search.product(product.name)).toBeVisible();
  await search.addToBasket(product.name).click();
  await expect(search.notification(OUT_OF_STOCK)).toBeVisible();
  expect(await basket.lines()).toEqual([]);
});
