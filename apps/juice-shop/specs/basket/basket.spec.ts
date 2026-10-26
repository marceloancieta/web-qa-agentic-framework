// The basket cases (registry/basket.md): adding from the search page, the total, the limit per
// customer, removing the last product, another customer's basket, the basket without a session, and
// a slow and a failed basket answer. Every case that changes a basket takes a customer of its own,
// created for the case, so no case sees another's items; the products go in through `api/` except
// in TC-BASKET-03, which adds through the page, and what the page claims is read back through `api/`.

import { knownGap } from '../../../../helpers/case-meta';
import { seedSessionStorage } from '../../../../helpers/storage';
import { becomesVisibleWithin } from '../../../../helpers/watch';
import { BasketApi } from '../../api/basket-api';
import { CatalogueApi } from '../../api/catalogue-api';
import { Toolbar } from '../../components/toolbar';
import { expect, test, type Actor } from '../../fixtures';
import { slowBasket } from '../../mocks/checkout-mocks';
import { basketFails } from '../../mocks/shop-mocks';
import { BasketPage } from '../../pages/basket-page';
import { LoginPage } from '../../pages/login-page';
import { SearchPage } from '../../pages/search-page';

// <PRODUCT> of the registry's test_data: a product with a limit per customer, read from the API.
const PRODUCT = 'Apple Juice (1000ml)';
// The empty state of REQ-BASKET-02, as the page writes it.
const EMPTY_TOTAL = 'Total Price: 0¤';
const NO_BONUS = 'You will gain 0 Bonus Points from this order!';
// A basket change takes up to three calls (read the item, save it, reload the basket), which took
// over 5 s together while other runs used the shop; what follows a click waits this long for them.
const ANSWER = 15_000;
// How long a case watches for something that must never show, from the opening of the page on.
const WATCH = 15_000;
/** The basket button's text ends with the count: "Your Basket <n>" on a wide screen, "<n>" below. */
const counts = (n: number) => new RegExp(`(?:^|\\D)${n}$`);
/** The amount of "Total Price: <amount>¤". */
const amountOf = (text: string | null) => Number(/Total Price: ([\d.]+)¤/.exec(text ?? '')?.[1]);

/** A customer created for the case, with the basket client bound to their account. */
async function aCustomer(
  actor: (role?: string, options?: { fresh?: boolean }) => Promise<Actor>,
): Promise<{ customer: Actor; basket: BasketApi }> {
  const customer = await actor('customer', { fresh: true });
  if (!customer.account) throw new Error('A fresh customer has an account.');
  return { customer, basket: await BasketApi.of(customer.api, customer.account) };
}

/** Open the basket page and resolve once its contents have answered. */
async function openBasket(page: BasketPage): Promise<void> {
  const contents = page.contentsLoaded();
  await page.open();
  await contents;
}

test.describe('the basket writes', () => {
  test.beforeEach(({ qa }) => {
    test.skip(
      !qa.allowWrites,
      'the case creates an account and changes its basket; allow_writes is false',
    );
  });

  test('TC-BASKET-03 adding <PRODUCT> from the search page says "Placed <PRODUCT> into basket.", the basket button shows 1 and the basket lists it with quantity 1 @smoke', async ({
    actor,
  }) => {
    const { customer, basket } = await aCustomer(actor);
    const { page } = customer;
    const product = await new CatalogueApi(customer.api).product(PRODUCT);
    const search = new SearchPage(page);
    const toolbar = new Toolbar(page);
    const basketPage = new BasketPage(page);
    expect(await basket.lines(), 'the basket of a new customer starts empty').toEqual([]);

    await test.step('add <PRODUCT> from the search page', async () => {
      await search.open(PRODUCT);
      await expect(toolbar.basketButton()).toHaveText(counts(0));
      await search.addToBasket(PRODUCT).click();
    });

    await test.step('the notification names the product and the basket button shows 1', async () => {
      await expect(search.notification(`Placed ${PRODUCT} into basket.`)).toBeVisible({
        timeout: ANSWER,
      });
      await expect(toolbar.basketButton()).toHaveText(counts(1), { timeout: ANSWER });
    });

    await test.step('the basket page lists <PRODUCT> with quantity 1', async () => {
      await openBasket(basketPage);
      await expect(basketPage.rows()).toHaveCount(1);
      await expect(basketPage.row(PRODUCT)).toBeVisible();
      await expect(basketPage.quantity(PRODUCT)).toHaveText('1');
    });

    await test.step('the API holds <PRODUCT> once', async () => {
      expect(await basket.lines()).toEqual([{ name: PRODUCT, price: product.price, quantity: 1 }]);
    });
  });

  test('TC-BASKET-05 with two products in different quantities, the total is the sum of each price times its quantity @regression', async ({
    actor,
  }) => {
    const { customer, basket } = await aCustomer(actor);
    const catalogue = new CatalogueApi(customer.api);
    const first = await catalogue.product(PRODUCT);
    // The most stocked product priced unlike <PRODUCT>, so each price weighs on the total.
    const second = (await catalogue.stocked()).find((p) => p.price !== first.price);
    if (!second) throw new Error(`The catalogue has no product priced unlike ${PRODUCT}.`);
    const lines = [
      { product: first, quantity: 2 },
      { product: second, quantity: 3 },
    ];
    for (const { product, quantity } of lines) await basket.add(product.id, quantity);
    const expected = lines.reduce(
      (sum, { product, quantity }) => sum + product.price * quantity,
      0,
    );
    const basketPage = new BasketPage(customer.page);

    await openBasket(basketPage);
    await test.step('each product has its row with its quantity', async () => {
      await expect(basketPage.rows()).toHaveCount(lines.length);
      for (const { product, quantity } of lines) {
        await expect(basketPage.quantity(product.name)).toHaveText(String(quantity));
      }
    });

    await test.step('the total is the sum of each price times its quantity', async () => {
      // Compared as a number: the case is about the sum, whatever digits the page prints.
      await expect
        .poll(async () => amountOf(await basketPage.total().textContent()), {
          message: `the total of ${lines.length} products`,
        })
        .toBeCloseTo(expected, 2);
    });
  });

  test('TC-BASKET-06 <PRODUCT> goes up to 5 in the basket; a sixth says "You can order only up to 5 items of this product." and the quantity stays 5 @regression', async ({
    actor,
  }) => {
    const { customer, basket } = await aCustomer(actor);
    const catalogue = new CatalogueApi(customer.api);
    const product = await catalogue.product(PRODUCT);
    // The boundary comes from the shop, so a change of the catalogue moves it with the case.
    const { limitPerUser: limit } = await catalogue.quantity(product.id);
    if (limit === null || limit < 2) {
      throw new Error(`${PRODUCT} has no limit per customer to test (limit ${limit}).`);
    }
    await basket.add(product.id, limit - 1);
    const basketPage = new BasketPage(customer.page);
    const refusal = basketPage.notification(
      `You can order only up to ${limit} items of this product.`,
    );

    await openBasket(basketPage);
    await expect(basketPage.quantity(PRODUCT)).toHaveText(String(limit - 1));

    await test.step('one more reaches the limit', async () => {
      // The page reads the item, saves it and reloads the basket; the quantity changes on the reload.
      const reloaded = basketPage.contentsLoaded();
      await basketPage.increase(PRODUCT).click();
      await reloaded;
      // The page asks for the basket twice on opening; `reloaded` may resolve on the second of
      // those, so the quantity gets the time the save and the reload take.
      await expect(basketPage.quantity(PRODUCT)).toHaveText(String(limit), { timeout: ANSWER });
    });

    await test.step('one past the limit is refused with the message', async () => {
      await basketPage.increase(PRODUCT).click();
      await expect(refusal).toBeVisible({ timeout: ANSWER });
      await expect(basketPage.quantity(PRODUCT)).toHaveText(String(limit));
    });

    await test.step('the API keeps the quantity at the limit', async () => {
      expect(await basket.lines()).toEqual([
        { name: PRODUCT, price: product.price, quantity: limit },
      ]);
    });
  });

  test('TC-BASKET-09 removing the last product returns the basket to its empty state @regression', async ({
    actor,
  }) => {
    const { customer, basket } = await aCustomer(actor);
    // A product that earns bonus points, so the empty state's "0 Bonus Points" is a change the
    // removal makes, not what the page already showed.
    const product = (await new CatalogueApi(customer.api).stocked()).find((p) => p.price >= 10);
    if (!product) throw new Error('No stocked product costs 10¤ or more.');
    await basket.add(product.id);
    const basketPage = new BasketPage(customer.page);

    await openBasket(basketPage);
    await expect(basketPage.row(product.name)).toBeVisible();
    await expect(basketPage.checkout()).toBeEnabled();
    await expect(basketPage.bonus()).not.toHaveText(NO_BONUS);

    await test.step('remove the last product', async () => {
      await basketPage.remove(product.name).click();
    });

    await test.step('the page shows the empty state', async () => {
      await expect(basketPage.rows()).toHaveCount(0, { timeout: ANSWER });
      await expect(basketPage.total()).toHaveText(EMPTY_TOTAL);
      await expect(basketPage.checkout()).toBeDisabled();
      await expect(basketPage.bonus()).toHaveText(NO_BONUS);
    });

    await test.step('the API holds no product', async () => {
      expect(await basket.lines()).toEqual([]);
    });
  });

  test("TC-BASKET-11 a second customer who asks for the first one's basket id is refused by the API, and the page shows none of the first one's products @regression @security @known-gap", async ({
    actor,
    qa,
  }) => {
    // Two accounts and a full watch window: three times the time of a case about one page.
    test.slow();
    const { customer: first, basket: firstBasket } = await aCustomer(actor);
    const product = await new CatalogueApi(first.api).product(PRODUCT);
    await firstBasket.add(product.id);
    expect(await firstBasket.lines(), 'the first basket holds <PRODUCT>').toEqual([
      { name: PRODUCT, price: product.price, quantity: 1 },
    ]);
    const { customer: second } = await aCustomer(actor);
    // The second customer's own session asks for the first basket's id.
    const asked = new BasketApi(second.api, firstBasket.basketId);
    const basketPage = new BasketPage(second.page);
    await seedSessionStorage(second.page, new URL(qa.baseUrl).origin, {
      bid: String(firstBasket.basketId),
    });

    test.fail(
      true,
      await knownGap('LOCAL-1', "a customer reads another customer's basket by its id"),
    );
    await test.step("the API refuses the first customer's basket", async () => {
      await expect
        .soft(asked.lines(), "the API refuses another customer's basket id")
        .rejects.toThrow(/did not load/);
    });

    await test.step("the page with the first basket's id shows none of its products", async () => {
      // The page asks for the basket twice (the toolbar and the table) and fills the table after the
      // first answer, so a retrying "not there" would pass before the rows arrive; the watch covers
      // the whole window from the opening on.
      const shown = becomesVisibleWithin(basketPage.row(PRODUCT), WATCH);
      await openBasket(basketPage);
      await expect(basketPage.title()).toBeVisible();
      expect.soft(await shown, `${PRODUCT} of the first basket on the page`).toBe(false);
      await expect.soft(basketPage.rows(), 'rows of another basket').toHaveCount(0);
    });
  });

  // The loading case holds the basket's answer for HOLD and watches, from the opening of the page,
  // for a window that ends well before the answer: an empty total or 0 bonus points shown at any
  // moment of it, even after a spinner, is caught. A retrying negative check would pass at the
  // first moment the state was not shown. The real bonus of <PRODUCT> is also 0, so the window
  // must end before the answer arrives.
  const HOLD = 10_000;
  const WINDOW = 6_000;

  test('TC-BASKET-17 a slow basket answer never shows the empty state before the products arrive @regression @perf @known-gap', async ({
    actor,
  }) => {
    test.slow();
    const { customer, basket } = await aCustomer(actor);
    const product = await new CatalogueApi(customer.api).product(PRODUCT);
    await basket.add(product.id);
    const basketPage = new BasketPage(customer.page);
    await slowBasket(customer.page, HOLD);
    const contents = basketPage.contentsLoaded();
    const asked = Date.now();
    const emptyTotal = becomesVisibleWithin(basketPage.totalReading(EMPTY_TOTAL), WINDOW);
    const noBonus = becomesVisibleWithin(basketPage.bonusReading(NO_BONUS), WINDOW);
    await basketPage.open();
    // The title comes from its own answer, which is not held: the page is on the screen.
    await expect(basketPage.title()).toBeVisible();
    const [sawEmptyTotal, sawNoBonus] = await Promise.all([emptyTotal, noBonus]);
    // Hard, before the arm: a watch that outlasted the hold would have seen the page with its data.
    expect(Date.now() - asked, 'the watch ended while the basket was held').toBeLessThan(HOLD);

    test.fail(
      true,
      await knownGap('LOCAL-13', 'the basket shows its empty state until the basket answers'),
    );
    await test.step('while the basket is held, the page showed no empty total and no 0 bonus points', async () => {
      expect.soft(sawEmptyTotal, 'an empty total before the basket answers').toBe(false);
      expect.soft(sawNoBonus, '0 bonus points before the basket answers').toBe(false);
    });

    await test.step('once the basket answers, the page shows the product and its total', async () => {
      await contents;
      await expect(basketPage.row(PRODUCT)).toBeVisible();
      await expect(basketPage.quantity(PRODUCT)).toHaveText('1');
      await expect(basketPage.total()).toHaveText(`Total Price: ${product.price}¤`);
    });
  });
});

test.describe('a failed basket answer', () => {
  // The 500 is the mocked answer the case is about; the guard keeps watching everything else.
  test.use({ pageHealth: { allowRequests: [/\/rest\/basket\/\d+$/] } });

  test('TC-BASKET-18 a failed basket answer is not shown as an empty basket @regression @mocked @known-gap', async ({
    actor,
    qa,
  }) => {
    test.skip(
      !qa.allowWrites,
      'the case creates an account and fills its basket; allow_writes is false',
    );
    // The basket really holds a product, so an empty basket on the page can only come from the
    // failed answer.
    const { customer, basket } = await aCustomer(actor);
    const product = await new CatalogueApi(customer.api).product(PRODUCT);
    await basket.add(product.id);
    const basketPage = new BasketPage(customer.page);
    await basketFails(customer.page);

    await openBasket(basketPage);
    await expect(basketPage.title()).toBeVisible();
    test.fail(
      true,
      await knownGap('LOCAL-17', 'a failed basket answer is shown as an ordinary empty basket'),
    );
    await expect
      .soft(basketPage.total(), 'an empty total on a failed answer')
      .not.toHaveText(EMPTY_TOTAL);
    await expect
      .soft(basketPage.bonus(), '0 bonus points on a failed answer')
      .not.toHaveText(NO_BONUS);
  });
});

test('TC-BASKET-12 without a session, /#/basket opens the login and shows no basket @regression @security @known-gap', async ({
  actor,
}) => {
  const { page } = await actor('anonymous');
  const basketPage = new BasketPage(page);
  const login = new LoginPage(page);

  test.fail(true, await knownGap('LOCAL-3', '/#/basket opens without a session'));
  await basketPage.open();
  await expect.soft(page, '/#/basket sends to the login').toHaveURL(/#\/login$/);
  await expect.soft(login.email(), 'the login form').toBeVisible();
  await expect.soft(basketPage.title(), 'no basket without a session').toBeHidden();
});
