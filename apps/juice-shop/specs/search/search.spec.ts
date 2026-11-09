// The product search (registry/search.md): all products and the results of a term, no results, a
// term with markup, with escaped characters and a very long one, the paginator and its page sizes,
// the deep link and history, the toolbar's search box, what a card shows, the layout, the
// accessibility, and the loading, error and empty states. No case changes data; each one reads the
// catalogue the application ships with, as a visitor, except the one that compares a signed-in
// customer. The catalogue read through the API is the oracle for which products a term should give,
// so no count is typed here.

import { knownGap } from '../../../../helpers/case-meta';
import { tabUntil } from '../../../../helpers/keyboard';
import {
  animationsFinished,
  horizontalOverflow,
  pastTheWidth,
  textSpill,
  unloadedImages,
} from '../../../../helpers/layout';
import { becomesVisibleWithin } from '../../../../helpers/watch';
import { AccountApi } from '../../api/account-api';
import { CatalogueApi, type Product } from '../../api/catalogue-api';
import { escapingTerm, longTerm, markupTerm, noMatchTerm } from '../../builders/search-terms';
import { Toolbar } from '../../components/toolbar';
import { expect, test } from '../../fixtures';
import {
  emptyCatalogue,
  PRODUCT_SEARCH,
  searchFails,
  slowSearch,
  STOCK,
} from '../../mocks/shop-mocks';
import { SearchPage } from '../../pages/search-page';

// <TERM>: a term three products of the catalogue contain (registry test_data).
const TERM = 'apple';
// A second term for the history case, with results none of <TERM>'s share.
const OTHER = 'melon';
// The paginator's page sizes (REQ-SEARCH-05).
const PAGE_SIZES = [15, 30, 45, 60] as const;
const PAGE_SIZE = 15;
// The list shows only once both the catalogue and the stock have answered; with other specs running
// against the same container the catalogue took up to 5.8 s and the stock longer (traces of
// 2026-10-26), so the first wait after a navigation gets this much.
const LOADED = 15_000;
// The paginator's range, "1 – 15 of 46", with an en dash.
const range = (from: number, to: number, total: number) => `${from} – ${to} of ${total}`;

const holds = (text: string, term: string) => text.toLowerCase().includes(term.toLowerCase());

/**
 * The products whose name contains `term`, whatever its case: the rule of REQ-SEARCH-02. The page
 * also matches a term against the descriptions (live look, 2026-11-08: "50%" finds a product whose
 * description holds it), so a term that only a description holds would make the oracle wrong.
 */
function named(products: Product[], term: string): Product[] {
  const onlyDescribed = products.filter((p) => !holds(p.name, term) && holds(p.description, term));
  // Data in the wrong state fails: the oracle reads names only.
  if (onlyDescribed.length > 0) {
    throw new Error(
      `"${term}" is in the description of ${onlyDescribed.map((p) => p.name).join(', ')}; the case needs a term only names hold.`,
    );
  }
  return products.filter((p) => holds(p.name, term));
}

/** `named`, for a term with a few results on one page. */
function matching(products: Product[], term: string): Product[] {
  const found = named(products, term);
  // Data in the wrong state fails: the case needs a term with a few results on one page.
  if (found.length === 0 || found.length > PAGE_SIZE) {
    throw new Error(
      `"${term}" matches ${found.length} products; the case needs 1 to ${PAGE_SIZE}.`,
    );
  }
  return found;
}

/**
 * The page shows exactly `expected` under the title of `term`. The title comes first: after a
 * navigation inside the page the cards of the previous term are still there until it changes.
 */
async function expectResults(search: SearchPage, expected: Product[], term: string) {
  await expect(search.title()).toHaveText(`Search Results - ${term}`, { timeout: LOADED });
  for (const { name } of expected) {
    await expect(search.product(name)).toBeVisible({ timeout: LOADED });
  }
  await expect(search.products()).toHaveCount(expected.length);
  await expect(search.range()).toHaveText(range(1, expected.length, expected.length));
}

/** Every image of the cards on the page has loaded. */
const imagesLoaded = (search: SearchPage) =>
  expect.poll(() => unloadedImages(search.productImages()), { timeout: LOADED }).toEqual([]);

test('TC-SEARCH-02 <TERM> keeps exactly the products whose name contains it, under "Search Results - <TERM>" @smoke', async ({
  actor,
}) => {
  const { page, api } = await actor('anonymous');
  const expected = matching(await new CatalogueApi(api).products(), TERM);
  const search = new SearchPage(page);

  await search.open(TERM);
  // The title reads "All Products" until the catalogue has loaded and been filtered (first runs,
  // 2026-10-26), so the products come first.
  for (const { name } of expected) {
    await expect(search.product(name)).toBeVisible({ timeout: LOADED });
  }
  await expect(search.products()).toHaveCount(expected.length);
  await expect(search.title()).toHaveText(`Search Results - ${TERM}`);
  await expect(search.range()).toHaveText(range(1, expected.length, expected.length));
});

test('TC-SEARCH-04 <NO_MATCH> shows "No results found", the hint to adjust the search and "0 of 0" @regression', async ({
  actor,
}) => {
  const { page, api } = await actor('anonymous');
  // <NO_MATCH>: unique per run; the catalogue confirms no product name contains it.
  const noMatch = noMatchTerm(test.info().workerIndex);
  const products = await new CatalogueApi(api).products();
  const clashes = products.filter((p) => p.name.toLowerCase().includes(noMatch.toLowerCase()));
  expect(clashes, 'no product name contains <NO_MATCH>').toEqual([]);
  const search = new SearchPage(page);

  await search.open(noMatch);
  await expect(search.noResults()).toBeVisible({ timeout: LOADED });
  await expect(search.noResultsHint()).toBeVisible();
  await expect(search.range()).toHaveText('0 of 0');
  await expect(search.products()).toHaveCount(0);
});

test('TC-SEARCH-05 <MARKUP> shows in the title as the characters typed, and the page creates no element from it @regression @security @known-gap', async ({
  actor,
}) => {
  const { page, api } = await actor('anonymous');
  // <MARKUP>: a harmless element, never a script; its inner text shows either way.
  const markup = markupTerm();
  const inner = markup.replace(/<[^>]+>/g, '');
  const products = await new CatalogueApi(api).products();
  const clashes = products.filter((p) => p.name.toLowerCase().includes(markup.toLowerCase()));
  expect(clashes, 'no product name contains <MARKUP>').toEqual([]);
  const search = new SearchPage(page);

  await search.open(markup);
  // The page has rendered the search, and the title holds the term's inner text in both
  // renderings, as text (`<b>…</b>` around it) or made into an element: what fails after the arm
  // is the markup alone, and once LOCAL-2 is fixed this line still holds.
  await expect(search.noResults()).toBeVisible({ timeout: LOADED });
  await expect(search.title()).toContainText(inner);

  test.fail(true, await knownGap('LOCAL-2', 'the search term is put into the page as markup'));
  // Shown as text, the title holds the angle brackets; made into an element, it reads
  // "Search Results - <inner text>" and the characters typed are gone.
  await expect(search.title()).toHaveText(`Search Results - ${markup}`);
});

test('TC-SEARCH-07 Previous is disabled on the first page and Next on the last; each moves one page and its range @regression @navigation', async ({
  actor,
}) => {
  const { page, api } = await actor('anonymous');
  const total = (await new CatalogueApi(api).products()).length;
  // Data in the wrong state fails: the ends need at least two pages.
  expect(total, 'the catalogue fills more than one page').toBeGreaterThan(PAGE_SIZE);
  const pages = Math.ceil(total / PAGE_SIZE);
  const search = new SearchPage(page);

  await test.step('open all products on the first page', async () => {
    await search.open();
    await expect(search.title()).toHaveText('All Products');
    await expect(search.range()).toHaveText(range(1, PAGE_SIZE, total), { timeout: LOADED });
    await expect(search.products()).toHaveCount(PAGE_SIZE);
    await expect(search.previous()).toBeDisabled();
    await expect(search.next()).toBeEnabled();
  });

  await test.step('Next moves to the second page', async () => {
    await search.next().click();
    await expect(search.range()).toHaveText(range(PAGE_SIZE + 1, 2 * PAGE_SIZE, total));
    await expect(search.previous()).toBeEnabled();
  });

  await test.step('Previous moves back to the first page', async () => {
    await search.previous().click();
    await expect(search.range()).toHaveText(range(1, PAGE_SIZE, total));
    await expect(search.previous()).toBeDisabled();
  });

  for (let index = 2; index <= pages; index++) {
    const from = (index - 1) * PAGE_SIZE + 1;
    const to = Math.min(index * PAGE_SIZE, total);
    await test.step(`Next moves to page ${index} of ${pages}`, async () => {
      await search.next().click();
      await expect(search.range()).toHaveText(range(from, to, total));
      await expect(search.products()).toHaveCount(to - from + 1);
    });
  }

  await test.step('on the last page Next is disabled and Previous enabled', async () => {
    await expect(search.next()).toBeDisabled();
    await expect(search.previous()).toBeEnabled();
  });
});

test('TC-SEARCH-10 "Open search" shows the box, and <TERM> sent from it opens /#/search?q=<TERM> with its results @regression', async ({
  actor,
}) => {
  const { page, api } = await actor('anonymous');
  const expected = matching(await new CatalogueApi(api).products(), TERM);
  const search = new SearchPage(page);
  const toolbar = new Toolbar(page);

  await test.step('open all products', async () => {
    await search.open();
    await expect(search.title()).toHaveText('All Products');
  });

  await test.step('"Open search" shows the box', async () => {
    // The box is always in the toolbar, collapsed and out of the tab order until it is opened
    // (first run, 2026-10-26), so a check of its visibility proves nothing. "Shows the box" is read
    // as: not focused before, focused and editable after (accepted at review, 2026-10-26).
    await expect(toolbar.searchBox()).not.toBeFocused();
    await toolbar.openSearch();
    await expect(toolbar.searchBox()).toBeVisible();
    await expect(toolbar.searchBox()).toBeFocused();
    await expect(toolbar.searchBox()).toBeEditable();
  });

  await test.step('send <TERM> from the box', async () => {
    // The box is open, so the term goes straight into it (contract assumption A1).
    await toolbar.submitSearch(TERM);
    await expect(page).toHaveURL(new RegExp(`#/search\\?q=${TERM}$`));
    for (const { name } of expected) {
      await expect(search.product(name)).toBeVisible({ timeout: LOADED });
    }
    await expect(search.products()).toHaveCount(expected.length);
    await expect(search.title()).toHaveText(`Search Results - ${TERM}`);
  });
});

test('TC-SEARCH-14 while a slow answer is pending the page says "Searching for products", and "No results found" never shows before the products @regression @perf @known-gap', async ({
  actor,
}) => {
  const { page } = await actor('anonymous');
  const HOLD = 6000;
  const search = new SearchPage(page);
  // The watch below always runs its whole window (HOLD + LOADED), and the page then loads again.
  test.slow();
  await slowSearch(page, HOLD);

  // Judged first, before the arm, so this half of the case keeps a verdict of its own.
  await test.step('no "No results found" before the products', async () => {
    // A retrying "not there" would pass once the products replace a flash of "No results found";
    // the watch covers the whole window from the navigation until well after the answer.
    const flashed = becomesVisibleWithin(search.noResults(), HOLD + LOADED);
    // Proof the hold is in effect: no product shows in the first half of it.
    const early = becomesVisibleWithin(search.products(), HOLD / 2);
    await search.open();
    expect(await early, 'products before the held answer was let through').toBe(false);
    await expect(search.products().first()).toBeVisible({ timeout: HOLD + LOADED });
    expect(await flashed, '"No results found" showed while the products were pending').toBe(false);
  });

  await test.step('"Searching for products" while the answer is held', async () => {
    // The hold applies to every load of the page, so a reload holds the answer again.
    // Watched from the new document on: until the reload commits, the old page still shows its
    // products, and a watch started before it would see them (WebKit is that fast).
    await page.reload({ waitUntil: 'commit' });
    const early = becomesVisibleWithin(search.products(), HOLD / 2);
    expect(await early, 'products before the held answer was let through').toBe(false);
    test.fail(
      true,
      await knownGap('LOCAL-18', 'the page shows no loading text while the products are pending'),
    );
    // Half the hold is left: the loading text, if the page shows one, is on screen now.
    await expect(search.searching()).toBeVisible({ timeout: 1000 });
    await expect(search.products().first()).toBeVisible({ timeout: HOLD + LOADED });
    await expect(search.searching()).toBeHidden();
  });
});

test.describe('a failed product answer', () => {
  // The 500 is the mocked answer the case is about; the guard keeps watching everything else.
  test.use({ pageHealth: { allowRequests: [PRODUCT_SEARCH, STOCK] } });

  test('TC-SEARCH-15 a failed product answer is not shown as "No results found" @regression @mocked', async ({
    actor,
  }) => {
    const { page } = await actor('anonymous');
    const search = new SearchPage(page);

    await searchFails(page);
    // The page could show the message and replace it; the watch covers the window from the
    // navigation on, as long as a navigation under load takes to settle (LOADED).
    test.slow();
    const shown = becomesVisibleWithin(search.noResults(), LOADED);
    await search.open();
    await expect(search.title()).toHaveText('All Products');
    expect(await shown, '"No results found" shown for a failed answer').toBe(false);
    await expect(search.products()).toHaveCount(0);
  });
});

test("TC-SEARCH-23 the toolbar's search box, once open, has an accessible name @regression @a11y @known-gap", async ({
  actor,
}) => {
  const { page } = await actor('anonymous');
  const search = new SearchPage(page);
  const toolbar = new Toolbar(page);

  await search.open();
  await expect(search.title()).toHaveText('All Products');
  await toolbar.openSearch();
  await expect(toolbar.searchBox()).toBeVisible();

  test.fail(true, await knownGap('LOCAL-6', 'the toolbar search box has no accessible name'));
  await expect(toolbar.searchBox()).toHaveAccessibleName(/\S/);
});

test('TC-SEARCH-01 without a term, the page lists "All Products", 15 cards and "1 – 15 of <total>" @sanity', async ({
  actor,
}) => {
  const { page, api } = await actor('anonymous');
  const total = (await new CatalogueApi(api).products()).length;
  // Data in the wrong state fails: 15 cards need a catalogue of more than one page.
  expect(total, 'the catalogue fills more than one page').toBeGreaterThan(PAGE_SIZE);
  const search = new SearchPage(page);

  await search.open();
  await expect(search.range()).toHaveText(range(1, PAGE_SIZE, total), { timeout: LOADED });
  await expect(search.title()).toHaveText('All Products');
  await expect(search.products()).toHaveCount(PAGE_SIZE);
});

test('TC-SEARCH-03 the term matches whatever its case: apple and APPLE give the same products @regression', async ({
  actor,
}) => {
  const { page, context, api } = await actor('anonymous');
  const upper = TERM.toUpperCase();
  // The oracle ignores the case, so both terms expect the same products.
  const expected = matching(await new CatalogueApi(api).products(), TERM);

  await test.step(`${TERM} gives its products`, async () => {
    const search = new SearchPage(page);
    await search.open(TERM);
    await expectResults(search, expected, TERM);
  });

  await test.step(`${upper} gives the same products`, async () => {
    // A page of its own, loaded from the start: on the same page the cards of the first term would
    // still be there while the second one is filtered.
    const search = new SearchPage(await context.newPage());
    await search.open(upper);
    await expectResults(search, expected, upper);
  });
});

test('TC-SEARCH-06 each page size, 15, 30, 45 and 60, shows that many cards and the matching range @regression', async ({
  actor,
}) => {
  const { page, api } = await actor('anonymous');
  const total = (await new CatalogueApi(api).products()).length;
  // Data in the wrong state fails: 30 needs a second page of 15 to differ from 15.
  expect(total, 'the catalogue fills more than one page').toBeGreaterThan(PAGE_SIZE);
  const search = new SearchPage(page);

  await search.open();
  await expect(search.range()).toHaveText(range(1, PAGE_SIZE, total), { timeout: LOADED });
  // 15 is chosen last: the page opens with it, so choosing it first would change nothing.
  for (const size of [...PAGE_SIZES.slice(1), PAGE_SIZES[0]]) {
    const shown = Math.min(size, total);
    await test.step(`${size} per page shows ${shown} cards`, async () => {
      await search.choosePageSize(size);
      await expect(search.pageSizeOptions()).toBeHidden();
      await expect(search.pageSize()).toHaveText(String(size));
      await expect(search.range()).toHaveText(range(1, shown, total));
      await expect(search.products()).toHaveCount(shown);
    });
  }
});

test('TC-SEARCH-08 the deep link /#/search?q=<TERM> shows its results, and a reload keeps them @regression @navigation', async ({
  actor,
}) => {
  const { page, api } = await actor('anonymous');
  const expected = matching(await new CatalogueApi(api).products(), TERM);
  const search = new SearchPage(page);
  const link = new RegExp(`#/search\\?q=${TERM}$`);

  await test.step('the deep link shows the results', async () => {
    await search.open(TERM);
    await expectResults(search, expected, TERM);
    await expect(page).toHaveURL(link);
  });

  await test.step('a reload keeps them', async () => {
    await page.reload();
    await expect(page).toHaveURL(link);
    await expectResults(search, expected, TERM);
  });
});

test("TC-SEARCH-09 Back and Forward between two searches show each term's results again @regression @navigation", async ({
  actor,
}) => {
  const { page, api } = await actor('anonymous');
  const products = await new CatalogueApi(api).products();
  const first = matching(products, TERM);
  const second = matching(products, OTHER);
  // Data in the wrong state fails: shared products would let a stale list pass for the new one.
  expect(
    first.filter((p) => second.some((q) => q.id === p.id)),
    'the two terms share no product',
  ).toEqual([]);
  const search = new SearchPage(page);

  await search.open(TERM);
  await expectResults(search, first, TERM);
  await search.open(OTHER);
  await expectResults(search, second, OTHER);

  await test.step(`Back shows the results of ${TERM}`, async () => {
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`#/search\\?q=${TERM}$`));
    await expectResults(search, first, TERM);
  });

  await test.step(`Forward shows the results of ${OTHER}`, async () => {
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`#/search\\?q=${OTHER}$`));
    await expectResults(search, second, OTHER);
  });
});

test('TC-SEARCH-11 each card shows the product\'s image named after the product, its name, its price and "Add to Basket" @regression', async ({
  actor,
}) => {
  // Four checks on each card of the whole catalogue (2026-11-08): 13 to 29 s on desktop Chromium,
  // 25 to 44 s on desktop Firefox, up to 51 s on the tablet, and past 90 s on Firefox while another
  // test suite loaded the machine.
  test.setTimeout(180_000);
  const { page, api } = await actor('anonymous');
  const products = await new CatalogueApi(api).products();
  const search = new SearchPage(page);

  // Every product on one page, so each card of the catalogue is checked whatever the page's order.
  await search.open();
  await expect(search.products()).toHaveCount(PAGE_SIZE, { timeout: LOADED });
  await search.choosePageSize(PAGE_SIZES[3]);
  await expect(search.products()).toHaveCount(products.length);
  for (const { name, price } of products) {
    await test.step(name, async () => {
      // The card is found by its name as text, so the image's name below is a claim of its own.
      await expect(search.cardName(name)).toBeVisible();
      await expect(search.cardImage(name)).toHaveAccessibleName(name);
      await expect(search.cardPrice(name)).toHaveText(`${price}¤`);
      await expect(search.cardAddToBasket(name)).toBeVisible();
    });
  }
});

test('TC-SEARCH-12 every product image of the first page loads @regression @layout', async ({
  actor,
}) => {
  const { page } = await actor('anonymous');
  const search = new SearchPage(page);

  await search.open();
  await expect(search.products()).toHaveCount(PAGE_SIZE, { timeout: LOADED });
  await expect(search.productImages()).toHaveCount(PAGE_SIZE);
  await imagesLoaded(search);
});

test('TC-SEARCH-16 an empty catalogue shows "No results found" and "0 of 0" @regression @mocked @known-gap', async ({
  actor,
}) => {
  const { page } = await actor('anonymous');
  const search = new SearchPage(page);

  await emptyCatalogue(page);
  // A pending answer looks like an empty catalogue (LOCAL-18), so the case waits for both answers
  // the list needs, the empty catalogue and the real stock: what fails after the arm is the missing
  // message, not a page still loading.
  const answered = search.listAnswered();
  await search.open();
  await answered;
  await expect(search.range()).toHaveText('0 of 0');
  await expect(search.products()).toHaveCount(0);

  test.fail(true, await knownGap('LOCAL-43', 'an empty catalogue shows no "No results found"'));
  await expect(search.noResults()).toBeVisible({ timeout: LOADED });
  await expect(search.noResultsHint()).toBeVisible();
});

test('TC-SEARCH-17 the search page has no horizontal scroll, and the cards fit the width @regression @responsive', async ({
  actor,
}) => {
  const { page } = await actor('anonymous');
  const search = new SearchPage(page);

  await search.open();
  await expect(search.products()).toHaveCount(PAGE_SIZE, { timeout: LOADED });
  // The cards take their size once their images are in.
  await imagesLoaded(search);
  await expect
    .poll(() => horizontalOverflow(page), { message: 'sideways scroll on the search page' })
    .toBe(0);
  await expect
    .poll(() => pastTheWidth(search.products()), { message: 'cards past the width of the page' })
    .toEqual([]);
});

test('TC-SEARCH-18 <LONG_TERM> stays inside the title @regression @content @known-gap', async ({
  actor,
}) => {
  const { page, api } = await actor('anonymous');
  // <LONG_TERM>: 200 characters without spaces, from the builder.
  const long = longTerm(200);
  expect(named(await new CatalogueApi(api).products(), long), 'no product holds it').toEqual([]);
  const search = new SearchPage(page);

  await search.open(long);
  await expect(search.noResults()).toBeVisible({ timeout: LOADED });
  // The whole term is in the title before its box is measured.
  await expect(search.title()).toHaveText(`Search Results - ${long}`);

  test.fail(true, await knownGap('LOCAL-42', 'a very long search term runs out of the title'));
  const spill = await textSpill(search.title());
  expect(spill.box, 'the term runs past the title').toBeLessThanOrEqual(0);
  expect(spill.viewport, 'the term runs past the page').toBeLessThanOrEqual(0);
});

test('TC-SEARCH-19 a term with characters that need escaping in a URL (&, #, %, a space) shows in the title as typed and keeps its results after a reload @regression @content', async ({
  actor,
}) => {
  const { page, api } = await actor('anonymous');
  const term = escapingTerm();
  // Data in the wrong state fails: unique per call, so no product holds it and its results are
  // "No results found"; a lost term would show all products instead.
  expect(named(await new CatalogueApi(api).products(), term), 'no product holds it').toEqual([]);
  const search = new SearchPage(page);

  await test.step('the term shows as typed', async () => {
    await search.open(term);
    await expect(search.title()).toHaveText(`Search Results - ${term}`, { timeout: LOADED });
    await expect(search.noResults()).toBeVisible({ timeout: LOADED });
    await expect(search.products()).toHaveCount(0);
  });

  await test.step('a reload keeps the term and its results', async () => {
    await page.reload();
    await expect(search.title()).toHaveText(`Search Results - ${term}`, { timeout: LOADED });
    await expect(search.noResults()).toBeVisible({ timeout: LOADED });
    await expect(search.products()).toHaveCount(0);
  });
});

test('TC-SEARCH-20 the page has no axe violation beyond the baseline, its images are named, and the paginator works with the keyboard @regression @a11y', async ({
  actor,
  a11y,
}) => {
  test.slow();
  const { page, api } = await actor('anonymous');
  const total = (await new CatalogueApi(api).products()).length;
  // Data in the wrong state fails: Next needs a page after a page of 30.
  expect(total, 'the catalogue fills more than two pages of 15').toBeGreaterThan(2 * PAGE_SIZE);
  const search = new SearchPage(page);

  await test.step('no axe violation beyond the baseline, and every image named', async () => {
    await search.open();
    await expect(search.range()).toHaveText(range(1, PAGE_SIZE, total), { timeout: LOADED });
    await imagesLoaded(search);
    await animationsFinished(page);
    await a11y.expectNoNewViolations(page);
    const images = search.productImages();
    await expect(images).toHaveCount(PAGE_SIZE);
    for (let index = 0; index < PAGE_SIZE; index++) {
      // Each image of the page in turn: the position is the identity here.
      await expect(images.nth(index)).toHaveAccessibleName(/\S/);
    }
  });

  await test.step('Tab to the page size, open it with Enter and choose 30 with the arrow', async () => {
    await tabUntil(page, search.pageSize(), 80);
    await expect(search.pageSize()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(search.pageSizeOptions()).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(search.pageSizeOptions()).toBeHidden();
    await expect(search.range()).toHaveText(range(1, 2 * PAGE_SIZE, total));
  });

  await test.step('Tab to Next and press Enter', async () => {
    await tabUntil(page, search.next(), 5);
    await expect(search.next()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(search.range()).toHaveText(
      range(2 * PAGE_SIZE + 1, Math.min(4 * PAGE_SIZE, total), total),
    );
  });

  await test.step('Shift+Tab to Previous and press Enter', async () => {
    await page.keyboard.press('Shift+Tab');
    await expect(search.previous()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(search.range()).toHaveText(range(1, 2 * PAGE_SIZE, total));
  });
});

test('TC-SEARCH-21 nothing beyond the term appears in the URL of a search @regression @security', async ({
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the customer is created through the API; allow_writes is false');
  // Signed in, so the page holds what must stay out of the URL: a token, an email, a basket id. A
  // visitor has none of them, and a leak of them would pass unseen.
  const { page, api, account } = await actor('customer');
  if (!account) throw new Error('A customer has an account.');
  expect(await new AccountApi(api).whoami(), 'the customer is signed in').toBe(account.username);
  const expected = matching(await new CatalogueApi(api).products(), TERM);
  const search = new SearchPage(page);

  await search.open();
  await expect(search.title()).toHaveText('All Products');
  // The search goes through the toolbar, so the address is the page's own, not one this case typed.
  await new Toolbar(page).search(TERM);
  await expectResults(search, expected, TERM);
  // The whole address: path, query and fragment hold the term and nothing else.
  await expect(page).toHaveURL(`${qa.baseUrl}/#/search?q=${TERM}`);
});

test('TC-SEARCH-22 the title of the list, "All Products" or "Search Results - <TERM>", is a heading a screen reader can reach @regression @a11y @known-gap', async ({
  actor,
}) => {
  const { page, context, api } = await actor('anonymous');
  const expected = matching(await new CatalogueApi(api).products(), TERM);
  // Both titles on pages of their own, ready before the arm, so only the heading is judged after it.
  const all = new SearchPage(page);
  await all.open();
  await expect(all.products()).toHaveCount(PAGE_SIZE, { timeout: LOADED });
  await expect(all.title()).toHaveText('All Products');
  const results = new SearchPage(await context.newPage());
  await results.open(TERM);
  await expectResults(results, expected, TERM);

  test.fail(true, await knownGap('LOCAL-5', 'the title of the product list is not a heading'));
  await expect(all.titleHeading()).toHaveText('All Products');
  await expect(results.titleHeading()).toHaveText(`Search Results - ${TERM}`);
});

test('TC-SEARCH-24 a signed-in customer gets the same products for <TERM> as a visitor @regression', async ({
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the customer is created through the API; allow_writes is false');
  const visitor = await actor('anonymous');
  const customer = await actor('customer');
  if (!customer.account) throw new Error('A customer has an account.');
  const expected = matching(await new CatalogueApi(visitor.api).products(), TERM);
  // The customer's session is the page's: the API answers with their account.
  expect(await new AccountApi(customer.api).whoami(), 'the customer is signed in').toBe(
    customer.account.username,
  );

  await test.step('the visitor', async () => {
    const search = new SearchPage(visitor.page);
    await search.open(TERM);
    await expectResults(search, expected, TERM);
  });

  await test.step('the signed-in customer', async () => {
    const search = new SearchPage(customer.page);
    await search.open(TERM);
    await expectResults(search, expected, TERM);
  });
});
