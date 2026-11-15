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

  async open(): Promise<void> {
    await this.button().click();
    await this.menu().waitFor();
  }

  logOut(): Locator {
    return this.menu().getByRole('menuitem', { name: 'Log out' });
  }

  async signOut(): Promise<void> {
    await this.open();
    await this.logOut().click();
  }
}
