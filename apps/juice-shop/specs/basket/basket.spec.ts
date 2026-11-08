// The basket cases (registry/basket.md): adding from the search page, the total, the limit per
// customer, removing the last product, another customer's basket, the basket without a session, and
// a slow and a failed basket answer. Every case that changes a basket takes a customer of its own,
// created for the case, so no case sees another's items; the products go in through `api/` except
// in the cases about adding from the search page, and what the page claims is read back through
// `api/`.

import type { Response } from '@playwright/test';
import { knownGap } from '../../../../helpers/case-meta';
import { tabUntil } from '../../../../helpers/keyboard';
import {
  clippedText,
  horizontalOverflow,
  textSpill,
  unloadedImages,
} from '../../../../helpers/layout';
import { seedSessionStorage } from '../../../../helpers/storage';
import { becomesVisibleWithin } from '../../../../helpers/watch';
import { BasketApi } from '../../api/basket-api';
import { CatalogueApi } from '../../api/catalogue-api';
import { aCustomerWithLongEmail } from '../../builders/account-builder';
import { Toolbar } from '../../components/toolbar';
import { expect, test, type Actor } from '../../fixtures';
import { slowBasket } from '../../mocks/checkout-mocks';
import { basketFails } from '../../mocks/shop-mocks';
import { AboutPage } from '../../pages/about-page';
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
// The same for an empty basket: long enough to run past its answer, at the cost of the wait.
const EMPTY_WATCH = 6_000;
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
async function openBasket(page: BasketPage): Promise<Response> {
  const contents = page.contentsLoaded();
  await page.open();
  return contents;
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

test.describe('the basket page', () => {
  test.beforeEach(({ qa }) => {
    test.skip(!qa.allowWrites, 'the case creates an account; allow_writes is false');
  });

  /** A customer of the case's own with <PRODUCT> in the basket. */
  async function aCustomerWithProduct(
    actor: Parameters<typeof aCustomer>[0],
  ): Promise<{ customer: Actor; basket: BasketApi; basketPage: BasketPage }> {
    const { customer, basket } = await aCustomer(actor);
    await basket.add((await new CatalogueApi(customer.api).product(PRODUCT)).id);
    return { customer, basket, basketPage: new BasketPage(customer.page) };
  }

  /** Wait for the images of the rows: a table can widen or reflow once they arrive. */
  const imagesLoaded = (basketPage: BasketPage) =>
    expect.poll(() => unloadedImages(basketPage.images())).toEqual([]);

  test('TC-BASKET-01 a customer\'s basket page is titled "Your Basket (<EMAIL>)" and shows the basket the session names @sanity', async ({
    actor,
  }) => {
    const { customer, basket, basketPage } = await aCustomerWithProduct(actor);
    const answer = await openBasket(basketPage);
    expect(new URL(answer.url()).pathname, 'the basket the session names').toBe(
      `/rest/basket/${basket.basketId}`,
    );
    await expect(basketPage.title()).toHaveText(`Your Basket (${customer.account?.username})`);
    await expect(basketPage.rows()).toHaveCount(1);
    await expect(basketPage.quantity(PRODUCT)).toHaveText('1');
  });

  test('TC-BASKET-02 an empty basket shows no rows, "Total Price: 0¤", a disabled Checkout and 0 bonus points @regression @navigation', async ({
    actor,
  }) => {
    const { customer, basket } = await aCustomer(actor);
    expect(await basket.lines(), 'the basket of a new customer starts empty').toEqual([]);
    const basketPage = new BasketPage(customer.page);
    // Until the answer the page looks empty whatever the basket holds (LOCAL-13), so the watch runs
    // past it: a row shown at any moment of the window is caught.
    const sawRow = becomesVisibleWithin(basketPage.rows().first(), EMPTY_WATCH);

    await openBasket(basketPage);
    await expect(basketPage.title()).toBeVisible();
    expect(await sawRow, 'a row in an empty basket').toBe(false);
    await expect(basketPage.rows()).toHaveCount(0);
    await expect(basketPage.totalReading(EMPTY_TOTAL)).toBeVisible();
    await expect(basketPage.checkout()).toBeDisabled();
    await expect(basketPage.bonusReading(NO_BONUS)).toBeVisible();
  });

  test('TC-BASKET-04 adding <PRODUCT> a second time says "Added another <PRODUCT> to basket." and its quantity becomes 2 @regression', async ({
    actor,
  }) => {
    const { customer, basket } = await aCustomer(actor);
    const { page } = customer;
    const product = await new CatalogueApi(customer.api).product(PRODUCT);
    const search = new SearchPage(page);
    const toolbar = new Toolbar(page);
    const basketPage = new BasketPage(page);

    await search.open(PRODUCT);
    await search.addToBasket(PRODUCT).click();
    await expect(toolbar.basketButton()).toHaveText(counts(1), { timeout: ANSWER });

    await search.addToBasket(PRODUCT).click();
    await expect(search.notification(`Added another ${PRODUCT} to basket.`)).toBeVisible({
      timeout: ANSWER,
    });
    await expect(toolbar.basketButton()).toHaveText(counts(2), { timeout: ANSWER });

    await openBasket(basketPage);
    await expect(basketPage.quantity(PRODUCT)).toHaveText('2');
    expect(await basket.lines()).toEqual([{ name: PRODUCT, price: product.price, quantity: 2 }]);
  });

  test('TC-BASKET-07 adding <SOLD_OUT> says "We are out of stock! Sorry for the inconvenience." and the basket stays as it was @regression', async ({
    actor,
  }) => {
    const { customer, basket } = await aCustomerWithProduct(actor);
    const soldOut = await new CatalogueApi(customer.api).soldOut();
    const before = await basket.lines();
    const search = new SearchPage(customer.page);

    await search.open(soldOut.name);
    await expect(search.product(soldOut.name)).toBeVisible();
    await search.addToBasket(soldOut.name).click();
    await expect(
      search.notification('We are out of stock! Sorry for the inconvenience.'),
    ).toBeVisible({ timeout: ANSWER });
    expect(await basket.lines()).toEqual(before);
  });

  test("TC-BASKET-08 the basket button's count follows the basket: 0 when empty, then the number of items @regression @responsive", async ({
    actor,
    app,
    stockedProduct,
  }) => {
    const { customer, basket } = await aCustomer(actor);
    const { page } = customer;
    const search = new SearchPage(page);
    const toolbar = new Toolbar(page);
    const shows = (items: number) =>
      expect(toolbar.basketButton()).toHaveText(toolbar.basketText(items, app), {
        timeout: ANSWER,
        // What shows: below the breakpoint "Your Basket" stays in the page, hidden.
        useInnerText: true,
      });

    await search.open(PRODUCT);
    await shows(0);
    for (const items of [1, 2]) {
      await search.addToBasket(PRODUCT).click();
      await shows(items);
    }
    expect((await basket.lines()).map(({ quantity }) => quantity)).toEqual([2]);

    // A change the page did not make: the count comes from the basket, not from the clicks.
    await basket.add(stockedProduct.id);
    await page.reload();
    await shows(3);
  });

  test('TC-BASKET-10 Checkout is enabled once the basket holds a product @regression @navigation', async ({
    actor,
  }) => {
    const { customer, basket } = await aCustomer(actor);
    const product = await new CatalogueApi(customer.api).product(PRODUCT);
    const basketPage = new BasketPage(customer.page);
    // Until the table's answer the page shows the empty state whatever the basket holds (LOCAL-13),
    // so the disabled Checkout is read after a window that runs past that answer.
    const sawRow = becomesVisibleWithin(basketPage.rows().first(), EMPTY_WATCH);

    await openBasket(basketPage);
    await expect(basketPage.title()).toBeVisible();
    expect(await sawRow, 'a row in an empty basket').toBe(false);
    await expect(basketPage.checkout()).toBeDisabled();

    await basket.add(product.id);
    await customer.page.reload();
    await expect(basketPage.row(PRODUCT)).toBeVisible({ timeout: ANSWER });
    await expect(basketPage.checkout()).toBeEnabled();
  });

  test('TC-BASKET-13 a basket with a product keeps it after a reload, and after leaving the page and going Back @regression @navigation', async ({
    actor,
  }) => {
    const { customer, basket, basketPage } = await aCustomerWithProduct(actor);
    const { page } = customer;
    const kept = async () => {
      await expect(basketPage.row(PRODUCT)).toBeVisible({ timeout: ANSWER });
      await expect(basketPage.quantity(PRODUCT)).toHaveText('1');
    };
    await openBasket(basketPage);
    await expect(basketPage.title()).toBeVisible();
    await kept();

    await test.step('a reload asks again and keeps the product', async () => {
      const answered = basketPage.contentsLoaded();
      await page.reload();
      await answered;
      await kept();
    });

    await test.step('leaving the page and going Back asks again and keeps the product', async () => {
      await new SearchPage(page).open();
      await expect(basketPage.title()).toHaveCount(0);
      const answered = basketPage.contentsLoaded();
      await page.goBack();
      await answered;
      await expect(page).toHaveURL(/#\/basket$/);
      await kept();
    });

    expect((await basket.lines()).map(({ name }) => name)).toEqual([PRODUCT]);
  });

  test('TC-BASKET-14 the basket button opens /#/basket from the search page and from the about page @regression @navigation', async ({
    actor,
  }) => {
    const { page } = await actor('customer');
    const toolbar = new Toolbar(page);
    const about = new AboutPage(page);
    const basketPage = new BasketPage(page);
    const onTheBasket = async () => {
      await expect(page).toHaveURL(/#\/basket$/);
      await expect(basketPage.title()).toBeVisible();
    };

    await new SearchPage(page).open();
    await toolbar.openBasket();
    await onTheBasket();

    await about.open();
    await expect(about.title()).toBeVisible();
    await toolbar.openBasket();
    await onTheBasket();
  });

  test('TC-BASKET-15 neither the basket id nor the email appears in the URL of the basket page @regression @security', async ({
    actor,
    qa,
  }) => {
    const { customer, basketPage } = await aCustomerWithProduct(actor);
    const { page } = customer;

    // Reached through the button, so the address is the page's own and not one the case typed.
    await new SearchPage(page).open();
    await new Toolbar(page).openBasket();
    await expect(basketPage.row(PRODUCT)).toBeVisible({ timeout: ANSWER });
    // The whole address: path, query and fragment leave no room for the id or the email.
    await expect(page).toHaveURL(`${qa.baseUrl}/#/basket`);
  });

  test('TC-BASKET-16 a basket with products has no horizontal scroll, and every row shows its name, quantity and price @regression @responsive', async ({
    actor,
    stockedProduct,
  }) => {
    const { customer, basket, basketPage } = await aCustomerWithProduct(actor);
    await basket.add(stockedProduct.id, 2);
    const lines = await basket.lines();
    expect(lines, 'the basket holds both products').toHaveLength(2);

    await openBasket(basketPage);
    await expect(basketPage.rows()).toHaveCount(lines.length);
    await imagesLoaded(basketPage);
    await expect
      .poll(() => horizontalOverflow(customer.page), { message: 'sideways scroll on the basket' })
      .toBe(0);
    for (const { name, price, quantity } of lines) {
      const whole = { ratio: 1 };
      await basketPage.row(name).scrollIntoViewIfNeeded();
      await expect(basketPage.name(name)).toHaveText(name);
      await expect(basketPage.name(name)).toBeInViewport(whole);
      await expect(basketPage.quantity(name)).toHaveText(String(quantity));
      await expect(basketPage.quantity(name)).toBeInViewport(whole);
      await expect(basketPage.price(name)).toHaveText(`${price}¤`);
      await expect(basketPage.price(name)).toBeInViewport(whole);
      expect(await clippedText(basketPage.row(name)), `text cut off in ${name}`).toEqual([]);
    }
  });

  test('TC-BASKET-19 every product image of the basket loads @regression @layout', async ({
    actor,
    stockedProduct,
  }) => {
    const { basket, basketPage } = await aCustomerWithProduct(actor);
    await basket.add(stockedProduct.id);
    await openBasket(basketPage);
    await expect(basketPage.images()).toHaveCount(2);
    await imagesLoaded(basketPage);
  });

  test('TC-BASKET-21 the basket table names its columns, its quantity controls are reached and used with the keyboard, and the page has no axe violation beyond the baseline @regression @a11y @known-gap', async ({
    actor,
    a11y,
  }) => {
    test.slow();
    const { customer, basket, basketPage } = await aCustomerWithProduct(actor);
    const { page } = customer;
    const quantityIs = async (quantity: number) => {
      await expect(basketPage.quantity(PRODUCT)).toHaveText(String(quantity), { timeout: ANSWER });
      expect((await basket.lines())[0]?.quantity).toBe(quantity);
    };
    await openBasket(basketPage);
    await expect(basketPage.row(PRODUCT)).toBeVisible();

    await test.step('Tab to the increase button and press Enter', async () => {
      await tabUntil(page, basketPage.increase(PRODUCT), 30);
      await expect(basketPage.increase(PRODUCT)).toBeFocused();
      await page.keyboard.press('Enter');
      await quantityIs(2);
    });

    await test.step('from the top of the page, Tab to the decrease button and press Enter', async () => {
      // The press above redraws the table and the focus falls to the body, so the walk starts over
      // from a reload until LOCAL-40 is fixed.
      await page.reload();
      await expect(basketPage.row(PRODUCT)).toBeVisible({ timeout: ANSWER });
      await tabUntil(page, basketPage.decrease(PRODUCT), 30);
      await expect(basketPage.decrease(PRODUCT)).toBeFocused();
      await page.keyboard.press('Enter');
      await quantityIs(1);
    });

    await a11y.expectNoNewViolations(page);

    test.fail(
      true,
      await knownGap('LOCAL-23', 'the header row of the products table has no column headers'),
    );
    await expect(basketPage.columnHeaders()).toContainText(['Product', 'Quantity', 'Price']);
  });

  test('TC-BASKET-22 the title with <LONG_EMAIL> stays inside the page @regression @content @known-gap', async ({
    actor,
  }) => {
    const account = aCustomerWithLongEmail(test.info().workerIndex);
    const customer = await actor('customer', { fresh: true, account });
    const basketPage = new BasketPage(customer.page);

    await openBasket(basketPage);
    await expect(basketPage.title()).toContainText(account.username);
    test.fail(true, await knownGap('LOCAL-41', 'a long email in the title runs out of the page'));
    await expect
      .poll(
        async () => {
          const { box, viewport } = await textSpill(basketPage.title(), basketPage.card());
          return Math.max(box, viewport);
        },
        { message: 'the title past its card or the viewport' },
      )
      .toBeLessThanOrEqual(0);
    await expect
      .poll(() => horizontalOverflow(customer.page), { message: 'sideways scroll with the title' })
      .toBe(0);
  });

  test('TC-BASKET-23 the longest product name of the catalogue stays inside its row @regression @content', async ({
    actor,
  }) => {
    const { customer, basket } = await aCustomer(actor);
    const catalogue = new CatalogueApi(customer.api);
    const byLength = (await catalogue.products()).sort((a, b) => b.name.length - a.name.length);
    // The longest name that can be added: a sold out product never reaches a basket.
    let longest: (typeof byLength)[number] | undefined;
    for (const product of byLength) {
      if ((await catalogue.quantity(product.id)).stock > 0) {
        longest = product;
        break;
      }
    }
    if (!longest) throw new Error('No product has stock left.');
    await basket.add(longest.id);
    const basketPage = new BasketPage(customer.page);

    await openBasket(basketPage);
    await expect(basketPage.name(longest.name)).toHaveText(longest.name);
    await imagesLoaded(basketPage);
    await expect
      .poll(async () => (await textSpill(basketPage.name(longest.name))).box, {
        message: 'the name past its cell',
      })
      .toBeLessThanOrEqual(0);
    expect(await clippedText(basketPage.row(longest.name)), 'the name cut off').toEqual([]);
    await expect
      .poll(() => horizontalOverflow(customer.page), { message: 'sideways scroll with the name' })
      .toBe(0);
  });
});
