// The user menu on every dashboard page: the member's name and address, preferences and "Log out".
// The button reads the member's initials, and their name too where the sidebar is on the page; the
// menu itself shows the full name and the address on every device.

import type { Locator, Page } from '@playwright/test';

export class UserMenu {
  constructor(private readonly page: Page) {}

  button(): Locator {
    return this.page.getByRole('button', { name: 'User menu' });
  }

  menu(): Locator {
    return this.page.getByRole('menu', { name: 'User menu' });
  }

  /**
   * Open the menu and return once it has finished opening. It grows in from a starting style that
   * declares no transition and no opacity, and Linux WebKit can still be in that first frame when
   * the menu becomes visible, so a read of its style then sees neither its transition nor its
   * final look. Opened is fully opaque, with or without reduced motion.
   */
  async open(): Promise<void> {
    await this.button().click();
    await this.menu().waitFor();
    const menu = await this.menu().elementHandle();
    await this.page.waitForFunction((element) => getComputedStyle(element!).opacity === '1', menu);
  }

  logOut(): Locator {
    return this.menu().getByRole('menuitem', { name: 'Log out' });
  }

  async signOut(): Promise<void> {
    await this.open();
    await this.logOut().click();
  }
}
