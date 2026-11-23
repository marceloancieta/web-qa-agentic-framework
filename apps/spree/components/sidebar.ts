// The dashboard's sidebar: the sections a member's role can read. From the `sidebar` breakpoint of
// app.json up it is on the page; below it, it opens from "Toggle Sidebar" as the dialog "Sidebar"
// (the dashboard's own mobile breakpoint, 768 px). Either way its sections are the links of two
// lists: the one that holds "Home", and the one below it that holds "Settings" alone.

import type { Locator, Page } from '@playwright/test';
import type { AppPack } from '../../../helpers/app-pack';

export class Sidebar {
  private constructor(
    private readonly page: Page,
    private readonly onPage: boolean,
  ) {}

  /** The sidebar in the form the page's viewport shows. */
  static for(page: Page, app: Pick<AppPack, 'breakpoints'>): Sidebar {
    const from = app.breakpoints?.['sidebar'];
    if (from === undefined) throw new Error('app.json has no breakpoints.sidebar.');
    return new Sidebar(page, (page.viewportSize()?.width ?? 0) >= from);
  }

  toggle(): Locator {
    return this.page.getByRole('button', { name: 'Toggle Sidebar' });
  }

  /** Make the sections reachable: below the breakpoint, open the dialog. */
  async open(): Promise<void> {
    if (this.onPage) return;
    await this.toggle().click();
    await this.page.getByRole('dialog', { name: 'Sidebar' }).waitFor();
  }

  /** The sidebar's lists of sections: the one that starts with "Home", and the one of "Settings". */
  private sections(): Locator {
    const scope = this.onPage ? this.page : this.page.getByRole('dialog', { name: 'Sidebar' });
    const holding = (name: string) =>
      scope.getByRole('list').filter({ has: this.page.getByRole('link', { name, exact: true }) });
    return holding('Home').or(holding('Settings'));
  }

  /**
   * What a screenshot of the sidebar takes: below the breakpoint, the dialog "Sidebar" (open it
   * first); from the breakpoint up, the page, with the dashboard beside the sidebar masked
   * (`masks()`). The column itself has no role or name, and an element screenshot of it waited in
   * WebKit for a box that never held still, so the page is taken instead.
   */
  screenshotTarget(): Page | Locator {
    return this.onPage ? this.page : this.page.getByRole('dialog', { name: 'Sidebar' });
  }

  /**
   * What a screenshot of the sidebar masks: the user menu, whose button holds the member's initials
   * and name (made per run, builders/staff-builder.ts), the notifications, whose count changes, and
   * from the breakpoint up the dashboard beside the sidebar, whose charts, dates and counts change
   * with every run.
   */
  masks(): Locator[] {
    return [
      this.page.getByRole('button', { name: 'User menu' }),
      this.page.getByRole('button', { name: /^Notifications/ }),
      ...(this.onPage ? [this.page.getByRole('main')] : []),
    ];
  }

  /** A section's link; the admin's Orders link carries the count of open orders ("Orders 3"). */
  section(name: string): Locator {
    return this.sections().getByRole('link', { name: new RegExp(`^${name}( \\d+)?$`) });
  }
}
