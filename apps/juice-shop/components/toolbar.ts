// The toolbar every page shares: the search box and the basket button. The basket button reads
// "Your Basket <n>" from the toolbar breakpoint up and the count alone below it; its accessible
// name is the same on every device.

import type { Locator, Page } from '@playwright/test';

export class Toolbar {
  constructor(private readonly page: Page) {}

  basketButton(): Locator {
    return this.page.getByRole('button', { name: 'Show the shopping cart' });
  }

  async openBasket(): Promise<void> {
    await this.basketButton().click();
  }

  /**
   * Send a term from the toolbar's search box. The box has no accessible name, label or
   * placeholder (LOCAL-6), so it is found inside its container; until that is fixed CSS is the
   * only handle on it.
   */
  /** Open the box and send a term. Once open, the box replaces the "Open search" button. */
  async search(term: string): Promise<void> {
    await this.openSearch();
    await this.submitSearch(term);
  }

  /** Send a term into the box when it is already open. */
  async submitSearch(term: string): Promise<void> {
    await this.searchBox().fill(term);
    await this.searchBox().press('Enter');
  }

  async openSearch(): Promise<void> {
    await this.page.getByRole('button', { name: 'Open search' }).click();
  }

  /** The search box, for the case about its name (LOCAL-6). */
  searchBox(): Locator {
    return this.page.locator('#searchQuery input'); // no name or label to find it by (LOCAL-6)
  }
}
