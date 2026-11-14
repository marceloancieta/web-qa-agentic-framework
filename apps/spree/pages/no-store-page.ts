// What a signed-in member who belongs to no store sees: a member the admin removed from the store
// still signs in and lands here (docs/app-notes.md, REQ-ROLES-08).

import type { Locator, Page } from '@playwright/test';

export class NoStorePage {
  constructor(private readonly page: Page) {}

  heading(): Locator {
    return this.page.getByRole('heading', {
      name: "You don't have access to any store",
      level: 1,
    });
  }

  signOut(): Locator {
    return this.page.getByRole('button', { name: 'Sign out' });
  }

  /** Text on the page, such as an order number that must not be there. */
  text(value: string): Locator {
    return this.page.getByText(value);
  }
}
