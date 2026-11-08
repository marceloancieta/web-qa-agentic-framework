// The toolbar every page shares: the search box and the basket button. The basket button reads
// "Your Basket <n>" from the toolbar breakpoint up and the count alone below it; its accessible
// name is the same on every device.

import type { Locator, Page } from '@playwright/test';
import type { AppPack } from '../../../helpers/app-pack';

export class Toolbar {
  constructor(private readonly page: Page) {}

  basketButton(): Locator {
    return this.page.getByRole('button', { name: 'Show the shopping cart' });
  }

  /** What the basket button reads with `count` items, in the form the page's viewport shows. */
  basketText(count: number, app: Pick<AppPack, 'breakpoints'>): RegExp {
    const toolbarFrom = app.breakpoints?.['toolbar'];
    if (toolbarFrom === undefined) throw new Error('app.json has no breakpoints.toolbar.');
    const wide = (this.page.viewportSize()?.width ?? 0) >= toolbarFrom;
    return new RegExp(wide ? `Your Basket\\s*${count}$` : `^(?!.*Basket).*\\D${count}$`);
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

  /** Open the side navigation: a read-only interaction on every page and device. */
  async openSideNav(): Promise<void> {
    await this.page.getByRole('button', { name: 'Open Sidenav' }).click();
  }

  async openSearch(): Promise<void> {
    await this.page.getByRole('button', { name: 'Open search' }).click();
  }

  /** The search box, for the case about its name (LOCAL-6). */
  searchBox(): Locator {
    return this.page.locator('#searchQuery input'); // no name or label to find it by (LOCAL-6)
  }
}
