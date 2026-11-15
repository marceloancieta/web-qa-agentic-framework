// The settings of the store (`/dashboard/<store id>/settings`): the settings the member's role can
// open, grouped under headings (Store, Selling, Developer...). The page shows each setting as a
// card in its main region, a link named by the setting and its description ("Imports History of
// CSV imports..."). From the `settings_navigation` breakpoint of app.json up (the dashboard's
// `lg`, 1024 px), a "Settings navigation" beside the cards, itself inside the main region, lists
// the same settings by name under "Back to dashboard"; below it there is no navigation.

import type { Locator, Page } from '@playwright/test';
import type { AppPack } from '../../../helpers/app-pack';

export class SettingsPage {
  private constructor(
    private readonly page: Page,
    private readonly storeId: string,
    private readonly withNavigation: boolean,
  ) {}

  /** The settings page in the form the page's viewport shows. */
  static for(page: Page, storeId: string, app: Pick<AppPack, 'breakpoints'>): SettingsPage {
    const from = app.breakpoints?.['settings_navigation'];
    if (from === undefined) throw new Error('app.json has no breakpoints.settings_navigation.');
    return new SettingsPage(page, storeId, (page.viewportSize()?.width ?? 0) >= from);
  }

  async open(): Promise<void> {
    await this.page.goto(`dashboard/${this.storeId}/settings`);
  }

  heading(): Locator {
    return this.page.getByRole('heading', { name: 'Settings', level: 1, exact: true });
  }

  /**
   * The cards, on every device: the main region's links outside the navigation. The navigation
   * sits inside the main region, and a locator by role cannot leave out a landmark's descendants,
   * so the cards are the main region's links that are not in it.
   */
  cards(): Locator {
    return this.page.getByRole('main').locator('a:not(aside a):not([role="complementary"] a)'); // excludes the navigation's links
  }

  /**
   * The settings the navigation lists by name, from the breakpoint up. Below it the cards are the
   * only list the page shows, so they stand for it.
   */
  navigationEntries(): Locator {
    if (!this.withNavigation) return this.cards();
    return this.page
      .getByRole('complementary', { name: 'Settings navigation' })
      .getByRole('list')
      .getByRole('link');
  }
}
