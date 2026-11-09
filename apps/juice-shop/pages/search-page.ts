// The product search (`/#/search`): one `article` per product, named by nothing but holding the
// product's image (its name as the alternative text), its price and Add to Basket; a title in plain
// text (LOCAL-5) and a paginator.

import type { Locator, Page, Response } from '@playwright/test';

export class SearchPage {
  constructor(private readonly page: Page) {}

  async open(term?: string): Promise<void> {
    await this.page.goto(
      term === undefined ? '#/search' : `#/search?q=${encodeURIComponent(term)}`,
    );
  }

  /**
   * Resolves when both answers the list waits for have arrived, the catalogue and the stock, a
   * mocked answer included. Start it before opening the page: while either is pending the page
   * shows what an empty catalogue shows (LOCAL-18).
   */
  listAnswered(): Promise<[Response, Response]> {
    const answer = (path: RegExp) =>
      this.page.waitForResponse((r) => path.test(new URL(r.url()).pathname));
    return Promise.all([answer(/\/rest\/products\/search$/), answer(/\/api\/Quantitys\/?$/)]);
  }

  /** The card of a product, by its exact name. */
  product(name: string): Locator {
    return this.page
      .getByRole('article')
      .filter({ has: this.page.getByRole('img', { name, exact: true }) });
  }

  products(): Locator {
    return this.page.getByRole('article');
  }

  /**
   * The card of a product, by the name it shows as text, for the case about what a card shows: it
   * leaves the image out of finding the card, so the image's name is still a claim to check.
   */
  card(name: string): Locator {
    return this.page
      .getByRole('article')
      .filter({ has: this.page.getByText(name, { exact: true }) });
  }

  /** The image of a card found by `card`. */
  cardImage(name: string): Locator {
    return this.card(name).getByRole('img');
  }

  /** The name of a card found by `card`, as text. */
  cardName(name: string): Locator {
    return this.card(name).getByText(name, { exact: true });
  }

  /** The price of a card found by `card`: "<amount>¤", with spaces around it in the markup. */
  cardPrice(name: string): Locator {
    return this.card(name).getByText(/^\s*\d+(\.\d+)?¤\s*$/);
  }

  /** The "Add to Basket" button of a card found by `card`. */
  cardAddToBasket(name: string): Locator {
    return this.card(name).getByRole('button', { name: 'Add to Basket' });
  }

  /** The image of every card on the page. */
  productImages(): Locator {
    return this.products().getByRole('img');
  }

  /**
   * Choose a page size with the pointer. The paginator lays a touch target over its select, and a
   * click lands on that layer, which opens the options; the select itself never receives it.
   */
  async choosePageSize(size: number): Promise<void> {
    // The touch target has no role or name: it is the select's enlarged hit area, and it lies over
    // the combobox, so a click on the combobox is refused. Inside the paginator, so a rename of the
    // class fails here alone.
    await this.page.getByRole('group').locator('.mat-mdc-paginator-touch-target').click();
    await this.page.getByRole('option', { name: String(size), exact: true }).click();
  }

  /** The page size options, once the select is open. */
  pageSizeOptions(): Locator {
    return this.page.getByRole('listbox', { name: 'Items per page:' });
  }

  addToBasket(name: string): Locator {
    return this.product(name).getByRole('button', { name: 'Add to Basket' });
  }

  /**
   * The list's title, "All Products" or "Search Results - <term>": plain text, not a heading,
   * until LOCAL-5 is fixed.
   */
  title(): Locator {
    return this.page.getByText(/^(All Products|Search Results - .+)$/);
  }

  /** The same title as a heading, for the case about it (LOCAL-5). */
  titleHeading(): Locator {
    return this.page.getByRole('heading', { name: /^(All Products|Search Results - .+)$/ });
  }

  noResults(): Locator {
    return this.page.getByText('No results found', { exact: true });
  }

  noResultsHint(): Locator {
    return this.page.getByText("Try adjusting your search to find what you're looking for.", {
      exact: true,
    });
  }

  /** "Searching for products", while the answer is pending. */
  searching(): Locator {
    return this.page.getByText('Searching for products', { exact: false });
  }

  pageSize(): Locator {
    return this.page.getByRole('combobox', { name: 'Items per page:' });
  }

  /** The paginator's range, "1 – 15 of 46". */
  range(): Locator {
    return this.page.getByRole('group').getByRole('status');
  }

  previous(): Locator {
    return this.page.getByRole('button', { name: 'Previous page' });
  }

  next(): Locator {
    return this.page.getByRole('button', { name: 'Next page' });
  }

  /** The notification a basket change answers with. */
  notification(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }
}
