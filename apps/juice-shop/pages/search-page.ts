// The product search (`/#/search`): one `article` per product, named by nothing but holding the
// product's image (its name as the alternative text), its price and Add to Basket; a title in plain
// text (LOCAL-5) and a paginator.

import type { Locator, Page } from '@playwright/test';

export class SearchPage {
  constructor(private readonly page: Page) {}

  async open(term?: string): Promise<void> {
    await this.page.goto(
      term === undefined ? '#/search' : `#/search?q=${encodeURIComponent(term)}`,
    );
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

  addToBasket(name: string): Locator {
    return this.product(name).getByRole('button', { name: 'Add to Basket' });
  }

  /**
   * The list's title, "All Products" or "Search Results - <term>": plain text, not a heading,
   * until LOCAL-5 is fixed.
   */
  title(): Locator {
    return this.page.getByText(/^(All Products|Search Results - .*)$/);
  }

  /** The same title as a heading, for the case about it (LOCAL-5). */
  titleHeading(): Locator {
    return this.page.getByRole('heading', { name: /^(All Products|Search Results - .*)$/ });
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
