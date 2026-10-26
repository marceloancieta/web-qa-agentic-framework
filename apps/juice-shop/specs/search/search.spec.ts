// The product search (registry/search.md): results for a term, no results, a term with markup, the
// paginator's ends, the toolbar's search box, and the loading and error states. No case writes; each
// one reads the catalogue the application ships with, as a visitor. The catalogue read through the
// API is the oracle for which products a term should give, so no count is typed here.

import { knownGap } from '../../../../helpers/case-meta';
import { becomesVisibleWithin } from '../../../../helpers/watch';
import { CatalogueApi, type Product } from '../../api/catalogue-api';
import { markupTerm, noMatchTerm } from '../../builders/search-terms';
import { Toolbar } from '../../components/toolbar';
import { expect, test } from '../../fixtures';
import { PRODUCT_SEARCH, searchFails, slowSearch, STOCK } from '../../mocks/shop-mocks';
import { SearchPage } from '../../pages/search-page';

// <TERM>: a term three products of the catalogue contain (registry test_data).
const TERM = 'apple';
const PAGE_SIZE = 15;
// The list shows only once both the catalogue and the stock have answered; with other specs running
// against the same container the catalogue took up to 5.8 s and the stock longer (traces of
// 2026-10-26), so the first wait after a navigation gets this much.
const LOADED = 15_000;
// The paginator's range, "1 – 15 of 46", with an en dash.
const range = (from: number, to: number, total: number) => `${from} – ${to} of ${total}`;

/** The products whose name contains `term`, whatever its case: the page's rule (REQ-SEARCH-02). */
function matching(products: Product[], term: string): Product[] {
  const found = products.filter((p) => p.name.toLowerCase().includes(term.toLowerCase()));
  // Data in the wrong state fails: the case needs a term with a few results on one page.
  if (found.length === 0 || found.length > PAGE_SIZE) {
    throw new Error(
      `"${term}" matches ${found.length} products; the case needs 1 to ${PAGE_SIZE}.`,
    );
  }
  return found;
}

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
    const early = becomesVisibleWithin(search.products(), HOLD / 2);
    await page.reload();
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
