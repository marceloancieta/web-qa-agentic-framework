// Visual: a basket with products on every device project, compared with baselines rendered in the
// pinned image (npm run lanes:visual). Every other run leaves this file's cases out. The products
// are named, not taken by stock, so every run shows the same rows; the title, which holds the
// account's email, is masked by the page object.

import { BasketApi } from '../../api/basket-api';
import { CatalogueApi } from '../../api/catalogue-api';
import { expect, test } from '../../fixtures';
import { BasketPage } from '../../pages/basket-page';

const LINES = [
  { name: 'Apple Juice (1000ml)', quantity: 2 },
  { name: 'Banana Juice (1000ml)', quantity: 1 },
];

test('TC-BASKET-20 a basket with products looks as designed @regression @visual @layout', async ({
  actor,
  qa,
  visual,
}) => {
  test.skip(
    !qa.allowWrites,
    'the case creates an account and fills its basket; allow_writes is false',
  );
  const customer = await actor('customer', { fresh: true });
  if (!customer.account) throw new Error('A fresh customer has an account.');
  const catalogue = new CatalogueApi(customer.api);
  const basketApi = await BasketApi.of(customer.api, customer.account);
  for (const { name, quantity } of LINES)
    await basketApi.add((await catalogue.product(name)).id, quantity);

  const basket = new BasketPage(customer.page);
  const contents = basket.contentsLoaded();
  await basket.open();
  await contents;
  await expect(basket.rows()).toHaveCount(LINES.length);
  for (const { name, quantity } of LINES)
    await expect(basket.quantity(name)).toHaveText(String(quantity));
  await visual.expectToMatch(customer.page, 'basket-with-products.png', basket.visualMasks(), {
    wholePage: true,
  });
});
