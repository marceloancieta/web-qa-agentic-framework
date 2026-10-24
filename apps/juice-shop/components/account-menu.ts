// The account menu, one API on every device. From the toolbar breakpoint up (app.json
// `breakpoints.toolbar`) the account is a menu behind a toolbar button; below it the toolbar has
// no such button and the account is a section of the side navigation. The strategy comes from the
// project's viewport, never from probing what is visible, so the same spec runs everywhere.

import type { Locator, Page } from '@playwright/test';
import type { AppPack } from '../../../helpers/app-pack';

export type AccountMenuLayout = 'toolbar' | 'sidenav';

export class AccountMenu {
  constructor(
    private readonly page: Page,
    readonly layout: AccountMenuLayout,
  ) {}

  /** The menu for the page's viewport, against the pack's toolbar breakpoint. */
  static for(page: Page, app: Pick<AppPack, 'breakpoints'>): AccountMenu {
    const width = page.viewportSize()?.width ?? 0;
    const toolbarFrom = app.breakpoints?.['toolbar'];
    if (toolbarFrom === undefined) throw new Error('app.json has no breakpoints.toolbar.');
    return new AccountMenu(page, width >= toolbarFrom ? 'toolbar' : 'sidenav');
  }

  async open(): Promise<void> {
    if (this.layout === 'toolbar') {
      await this.page.getByRole('button', { name: 'Show/hide account menu' }).click();
    } else {
      await this.page.getByRole('button', { name: 'Open Sidenav' }).click();
    }
  }

  /** Where the menu shows the signed-in account's email. */
  account(email: string): Locator {
    return this.layout === 'toolbar'
      ? this.page.getByRole('menuitem', { name: 'Go to user profile' }).filter({ hasText: email })
      : this.page.getByRole('navigation').getByText(email, { exact: true });
  }

  /** The entry that leads to the login page when nobody is signed in. */
  login(): Locator {
    return this.layout === 'toolbar'
      ? this.page.getByRole('menuitem', { name: 'Go to login page' })
      : this.page.getByRole('navigation').getByText('Login', { exact: true });
  }

  logout(): Locator {
    return this.layout === 'toolbar'
      ? this.page.getByRole('menuitem', { name: 'Logout' })
      : this.page.getByRole('navigation').getByText('Logout', { exact: true });
  }
}
