// The banner every signed-in page shares: the menu, the cart button and its badge.

import type { Locator, Page } from '@playwright/test';

/** The entries of the menu, as the page names them. */
export type MenuEntry = 'All Items' | 'Dynamic Catalog' | 'About' | 'Logout' | 'Reset App State';

export class Header {
  constructor(private readonly page: Page) {}

  /** The cart button; its accessible name says how many products the cart holds. */
  cartButton(): Locator {
    return this.page.getByRole('banner').getByRole('button', { name: /^Cart, / });
  }

  /** The count on the cart button, shown only while the cart holds a product. */
  cartBadge(): Locator {
    // The badge is a plain element inside the cart button, without a role or a name of its own.
    return this.page.getByTestId('shopping-cart-badge');
  }

  async openCart(): Promise<void> {
    await this.cartButton().click();
  }

  /** The menu's panel, present while the menu is open. */
  menu(): Locator {
    return this.page.getByRole('navigation');
  }

  /** One entry of the open menu; About is a link, the others are buttons. */
  menuEntry(name: MenuEntry): Locator {
    return name === 'About'
      ? this.menu().getByRole('link', { name, exact: true })
      : this.menu().getByRole('button', { name, exact: true });
  }

  async openMenu(): Promise<void> {
    await this.page.getByRole('button', { name: 'Open Menu' }).click();
  }

  async closeMenu(): Promise<void> {
    await this.page.getByRole('button', { name: 'Close Menu' }).click();
  }

  /** Open the menu and choose one of its entries. */
  async choose(entry: MenuEntry): Promise<void> {
    await this.openMenu();
    await this.menuEntry(entry).click();
  }
}
