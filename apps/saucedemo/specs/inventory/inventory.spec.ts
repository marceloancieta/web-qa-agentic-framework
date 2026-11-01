// The product list and a product's page (registry/inventory.md). Every case starts signed in as the
// `standard` actor with an empty cart, through the session cookie, except TC-INVENTORY-08, which
// opens a product without a session, and TC-INVENTORY-11, which signs in the performance-glitch
// actor. Nothing is written: sorting and opening a product change only the page, and no case presses
// "Add to cart" (the cart registry owns it).

import { knownGap } from '../../../../helpers/case-meta';
import { tabUntil, type FocusStop } from '../../../../helpers/keyboard';
import { horizontalOverflow } from '../../../../helpers/layout';
import { cancelledByPage } from '../../../../helpers/page-health';
import { BACKPACK, PRODUCT_COUNT, priceValue } from '../../builders/products';
import { expect, test } from '../../fixtures';
import { InventoryPage, type SortOption } from '../../pages/inventory-page';
import { LoginPage } from '../../pages/login-page';
import { ProductPage } from '../../pages/product-page';

// REQ-INVENTORY-01: the list's title.
const TITLE = 'Products';
// REQ-INVENTORY-02 and -04: the option the list opens with, as "Sort products" names it.
const DEFAULT_SORT = 'Name (A to Z)';
// REQ-INVENTORY-06: the name the product page shows for an unknown or missing id.
const NOT_FOUND = 'ITEM NOT FOUND';
// An id no product has (contract, Measurements: `?id=999`).
const UNKNOWN_ID = 999;
// REQ-INVENTORY-07, the login's REQ-LOGIN-08: the message of a protected page opened signed out.
const onlyWhenSignedIn = (path: string) =>
  `Epic sadface: You can only access '${path}' when you are logged in.`;
// REQ-INVENTORY-10: the application blocks the page for about 5 s each time it draws the list for
// performance_glitch_user. The list is waited for, with a ceiling well above that block; the
// ceiling is how long the case gives up after, never a time it waits.
const GLITCH_CEILING = 20_000;
// The list drawn for performance_glitch_user is late when it takes at least this long; the block
// is 5 s, and the margin covers the clock's granularity, while the standard list draws at once.
const LATE = 4_000;

const alphabetical = (a: string, b: string) => a.localeCompare(b, 'en');

/** The prices of the list in the order it shows them, as numbers. */
async function shownPrices(inventory: InventoryPage): Promise<number[]> {
  return (await inventory.prices().allTextContents()).map(priceValue);
}

/** Neighbouring prices that go the wrong way: down where they must not go down, or up. */
function againstOrder(prices: number[], never: 'down' | 'up'): string[] {
  return prices.flatMap((price, index) => {
    const next = prices[index + 1];
    if (next === undefined) return [];
    const wrong = never === 'down' ? next < price : next > price;
    return wrong ? [`${price} then ${next}`] : [];
  });
}

const describeStops = (stops: FocusStop[]) =>
  stops.map((stop) => `${stop.role} "${stop.name}"`).join(', ');

test('TC-INVENTORY-01 the list titled "Products" shows 6 products, each with its image, name, description, price and "Add to cart" @smoke', async ({
  standard,
}) => {
  const inventory = new InventoryPage(standard.page);
  await inventory.open();

  await expect(inventory.list()).toBeVisible();
  await expect(inventory.title()).toHaveText(TITLE);
  await expect(inventory.products()).toHaveCount(PRODUCT_COUNT);
  await expect(inventory.names()).toHaveCount(PRODUCT_COUNT);
  await expect(inventory.prices()).toHaveCount(PRODUCT_COUNT);
  await expect(inventory.prices()).toHaveText(Array(PRODUCT_COUNT).fill(/^\$\d+\.\d{2}$/));
  for (const name of await inventory.names().allTextContents()) {
    await expect(inventory.productImage(name), `${name}'s image`).toBeVisible();
    await expect(inventory.productDescription(name), `${name}'s description`).toHaveText(/\S/);
    await expect(inventory.productPrice(name), `${name}'s price`).toHaveText(/^\$\d+\.\d{2}$/);
    await expect(inventory.cartAction(name), `${name}'s cart button`).toHaveText('Add to cart');
  }
});

test('TC-INVENTORY-02 every product image on the list loads, and the page asks for no same-origin file that fails @regression @layout', async ({
  standard,
  qa,
}) => {
  const { page } = standard;
  const origin = new URL(qa.baseUrl).origin;
  const failed: string[] = [];
  // Every file the page asks for of its own site; the document the case opens is TC-INVENTORY-15's.
  page.on('response', (response) => {
    if (response.request().isNavigationRequest()) return;
    if (new URL(response.url()).origin !== origin || response.status() < 400) return;
    failed.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).origin !== origin) return;
    if (cancelledByPage(request.failure()?.errorText)) return;
    failed.push(`${request.failure()?.errorText} ${request.url()}`);
  });
  const inventory = new InventoryPage(page);
  await inventory.open();
  await expect(inventory.products()).toHaveCount(PRODUCT_COUNT);
  await expect(inventory.productImages()).toHaveCount(PRODUCT_COUNT);

  for (const image of await inventory.productImages().all()) {
    const name = await image.getAttribute('alt');
    await expect(image, `the image of ${name}`).toHaveJSProperty('complete', true);
    await expect(image, `the image of ${name} has no pixels`).not.toHaveJSProperty(
      'naturalWidth',
      0,
    );
  }
  // Every image has finished loading, so every file the list asked for has been answered.
  expect(failed, 'same-origin files that failed').toEqual([]);
});

test('TC-INVENTORY-03 the list opens with "Name (A to Z)" selected and the names in alphabetical order @regression', async ({
  standard,
}) => {
  const inventory = new InventoryPage(standard.page);
  await inventory.open();

  await expect(inventory.sort()).toHaveValue('az');
  await expect(inventory.selectedSort()).toHaveText(DEFAULT_SORT);
  await expect(inventory.names()).toHaveCount(PRODUCT_COUNT);
  const shown = await inventory.names().allTextContents();
  await expect(inventory.names()).toHaveText([...shown].sort(alphabetical));
});

test('TC-INVENTORY-04 each option of "Sort products" orders the list by it: names A to Z and Z to A, prices never going down for low to high and never going up for high to low @regression', async ({
  standard,
}) => {
  const inventory = new InventoryPage(standard.page);
  await inventory.open();
  await expect(inventory.names()).toHaveCount(PRODUCT_COUNT);
  const ascending = [...(await inventory.names().allTextContents())].sort(alphabetical);
  const descending = [...ascending].reverse();
  // The prices as the list first shows them go up and down, so a price sort that did nothing would
  // be caught.
  expect(againstOrder(await shownPrices(inventory), 'down')).not.toEqual([]);
  expect(againstOrder(await shownPrices(inventory), 'up')).not.toEqual([]);

  const choose = async (option: SortOption) => {
    await inventory.sortBy(option);
    await expect(inventory.sort()).toHaveValue(option);
    await expect(inventory.names()).toHaveCount(PRODUCT_COUNT);
  };

  await test.step('Name (Z to A) puts the names in reverse alphabetical order', async () => {
    await choose('za');
    await expect(inventory.names()).toHaveText(descending);
  });

  await test.step('Price (low to high): no price is lower than the one before it', async () => {
    await choose('lohi');
    await expect.poll(async () => againstOrder(await shownPrices(inventory), 'down')).toEqual([]);
    await expect
      .poll(async () => [...(await inventory.names().allTextContents())].sort(alphabetical))
      .toEqual(ascending);
  });

  await test.step('Price (high to low): no price is higher than the one before it', async () => {
    await choose('hilo');
    await expect.poll(async () => againstOrder(await shownPrices(inventory), 'up')).toEqual([]);
    await expect
      .poll(async () => [...(await inventory.names().allTextContents())].sort(alphabetical))
      .toEqual(ascending);
  });

  await test.step('Name (A to Z), chosen again, puts the names in alphabetical order', async () => {
    await choose('az');
    await expect(inventory.names()).toHaveText(ascending);
  });
});

test('TC-INVENTORY-05 after sorting by price and reloading, "Name (A to Z)" is selected again and the URL holds no sort @regression @navigation', async ({
  standard,
  qa,
}) => {
  const { page } = standard;
  const inventory = new InventoryPage(page);
  const listUrl = `${qa.baseUrl}/inventory.html`;
  await inventory.open();
  await expect(inventory.names()).toHaveCount(PRODUCT_COUNT);
  const ascending = [...(await inventory.names().allTextContents())].sort(alphabetical);

  await inventory.sortBy('lohi');
  await expect(inventory.sort()).toHaveValue('lohi');
  await expect(inventory.names()).not.toHaveText(ascending);
  await expect(page).toHaveURL(listUrl);

  await page.reload();

  await expect(inventory.list()).toBeVisible();
  await expect(inventory.sort()).toHaveValue('az');
  await expect(inventory.selectedSort()).toHaveText(DEFAULT_SORT);
  await expect(inventory.names()).toHaveText(ascending);
  await expect(page).toHaveURL(listUrl);
});

test('TC-INVENTORY-06 <PRODUCT>\'s name on the list opens /inventory-item.html?id=4 with the same image, name, description and price, and "Back to products" returns to the list @regression @navigation', async ({
  standard,
  qa,
}) => {
  const { page } = standard;
  const inventory = new InventoryPage(page);
  const product = new ProductPage(page);
  await inventory.open();
  await expect(inventory.list()).toBeVisible();

  // What the list shows for the product, which its page must repeat.
  await expect(inventory.productImage(BACKPACK.name)).toBeVisible();
  await expect(inventory.productDescription(BACKPACK.name)).toHaveText(/\S/);
  await expect(inventory.productPrice(BACKPACK.name)).toHaveText(/^\$\d+\.\d{2}$/);
  const image = (await inventory.productImage(BACKPACK.name).getAttribute('src')) ?? '';
  const description = (await inventory.productDescription(BACKPACK.name).textContent()) ?? '';
  const price = (await inventory.productPrice(BACKPACK.name).textContent()) ?? '';
  expect(image, `${BACKPACK.name}'s image file on the list`).not.toBe('');

  await inventory.openProduct(BACKPACK.name);

  await expect(page).toHaveURL(`${qa.baseUrl}/inventory-item.html?id=${BACKPACK.id}`);
  await expect(product.name()).toHaveText(BACKPACK.name);
  await expect(product.image()).toBeVisible();
  await expect(product.image()).toHaveAttribute('src', image);
  await expect(product.image()).toHaveAccessibleName(BACKPACK.name);
  await expect(product.description()).toHaveText(description);
  await expect(product.price()).toHaveText(price);

  await product.back();

  await expect(page).toHaveURL(`${qa.baseUrl}/inventory.html`);
  await expect(inventory.list()).toBeVisible();
  await expect(inventory.products()).toHaveCount(PRODUCT_COUNT);
});

test('TC-INVENTORY-07 /inventory-item.html with an unknown id and with no id shows "ITEM NOT FOUND" @regression', async ({
  standard,
}) => {
  const product = new ProductPage(standard.page);

  await test.step('an unknown id', async () => {
    await product.open(UNKNOWN_ID);
    await expect(product.name()).toHaveText(NOT_FOUND);
  });

  await test.step('no id', async () => {
    await product.open();
    await expect(product.name()).toHaveText(NOT_FOUND);
  });
});

test('TC-INVENTORY-08 /inventory-item.html?id=4 opened without a session sends the visitor to / with the message naming the path @regression @security', async ({
  page,
  qa,
}) => {
  const login = new LoginPage(page);
  const product = new ProductPage(page);

  await product.open(BACKPACK.id);

  await expect(login.error()).toHaveText(onlyWhenSignedIn('/inventory-item.html'));
  await expect(page).toHaveURL(`${qa.baseUrl}/`);
  await expect(product.name()).toHaveCount(0);
});

test('TC-INVENTORY-09 the list and a product page have no horizontal scroll @regression @responsive', async ({
  standard,
}) => {
  const { page } = standard;
  const inventory = new InventoryPage(page);
  const product = new ProductPage(page);

  await inventory.open();
  await expect(inventory.products()).toHaveCount(PRODUCT_COUNT);
  await expect.poll(() => horizontalOverflow(page)).toBe(0);

  await product.open(BACKPACK.id);
  await expect(product.name()).toHaveText(BACKPACK.name);
  await expect.poll(() => horizontalOverflow(page)).toBe(0);
});

test('TC-INVENTORY-10 "Open Menu" shows All Items, Dynamic Catalog, About, Logout and Reset App State, and "Close Menu" hides them @regression @navigation', async ({
  standard,
}) => {
  const inventory = new InventoryPage(standard.page);
  const { header } = inventory;
  const entries = ['All Items', 'Dynamic Catalog', 'About', 'Logout', 'Reset App State'] as const;
  await inventory.open();
  await expect(inventory.list()).toBeVisible();
  for (const entry of entries) await expect(header.menuEntry(entry), entry).toBeHidden();

  await header.openMenu();
  for (const entry of entries) await expect(header.menuEntry(entry), entry).toBeVisible();

  await header.closeMenu();
  for (const entry of entries) await expect(header.menuEntry(entry), entry).toBeHidden();
});

test('TC-INVENTORY-11 for the performance-glitch actor the list appears late with the same 6 products, and the case waits for the list, never for a time @regression @perf', async ({
  standard,
  actor,
}) => {
  // Both lists are timed the same way, from a fresh context each, so a slow link that delays both
  // cannot pass for the block: only the difference counts.
  const timeToList = async (inventory: InventoryPage) => {
    const asked = Date.now();
    await inventory.open();
    await expect(inventory.list()).toBeVisible({ timeout: GLITCH_CEILING });
    return Date.now() - asked;
  };
  const reference = new InventoryPage(standard.page);
  const referenceTook = await timeToList(reference);
  await expect(reference.names()).toHaveCount(PRODUCT_COUNT);
  const expected = await reference.names().allTextContents();

  const glitch = await actor('performance-glitch');
  const inventory = new InventoryPage(glitch.page);
  const took = await timeToList(inventory);

  expect(
    took - referenceTook,
    'the list appeared late, beyond the standard list',
  ).toBeGreaterThanOrEqual(LATE);
  await expect(inventory.names()).toHaveText(expected);
});

test("TC-INVENTORY-12 the sort is changed and a product's page opened with the keyboard alone @regression @a11y", async ({
  standard,
  qa,
}) => {
  const { page } = standard;
  const inventory = new InventoryPage(page);
  const product = new ProductPage(page);
  await inventory.open();
  await expect(inventory.names()).toHaveCount(PRODUCT_COUNT);
  const descending = [...(await inventory.names().allTextContents())].sort(alphabetical).reverse();

  await test.step('Tab reaches "Sort products" and the arrow key chooses the next option', async () => {
    const stops = await tabUntil(page, inventory.sort(), 10);
    await expect(inventory.sort(), `Tab passed ${describeStops(stops)}`).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(inventory.sort()).toHaveValue('za');
    await expect(inventory.names()).toHaveText(descending);
  });

  await test.step(`Tab reaches ${BACKPACK.name}'s name and Enter opens its page`, async () => {
    const target = inventory.productNameLink(BACKPACK.name);
    const stops = await tabUntil(page, target, 4 * PRODUCT_COUNT);
    await expect(target, `Tab passed ${describeStops(stops)}`).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`${qa.baseUrl}/inventory-item.html?id=${BACKPACK.id}`);
    await expect(product.name()).toHaveText(BACKPACK.name);
  });
});

test('TC-INVENTORY-13 the list and a product page have no axe violation beyond the baseline @regression @a11y', async ({
  standard,
  a11y,
}) => {
  const { page } = standard;
  const inventory = new InventoryPage(page);
  const product = new ProductPage(page);

  await inventory.open();
  await expect(inventory.products()).toHaveCount(PRODUCT_COUNT);
  await a11y.expectNoNewViolations(page);

  await product.open(BACKPACK.id);
  await expect(product.name()).toHaveText(BACKPACK.name);
  await a11y.expectNoNewViolations(page);
});

test('TC-INVENTORY-15 /inventory.html opened directly is answered 200, not 404 @regression @layout @known-gap', async ({
  standard,
}) => {
  const { page } = standard;
  const inventory = new InventoryPage(page);
  // The document the browser asks for when the list is opened, registered before it is opened.
  const answered = page.waitForResponse(
    (response) => response.request().isNavigationRequest() && response.frame() === page.mainFrame(),
  );

  await inventory.open();

  const document = await answered;
  await expect(inventory.list()).toBeVisible();
  test.fail(true, await knownGap('LOCAL-27', 'every page but the login is answered 404'));
  expect(document.status(), `the document ${new URL(document.url()).pathname}`).toBe(200);
});
