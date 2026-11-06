// The checkout's first step (`/#/address/select`): the customer's saved addresses, each a table row
// whose radio has no accessible name (LOCAL-9), so a row is found by its text.

import type { Locator, Page } from '@playwright/test';

export class AddressSelectPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('#/address/select');
  }

  /**
   * Resolves when the list of addresses has answered. Start it before the navigation that opens
   * the step: until then the table is empty whatever the account holds.
   */
  loaded(): Promise<unknown> {
    return this.page.waitForResponse((r) => new URL(r.url()).pathname === '/api/Addresss');
  }

  heading(): Locator {
    return this.page.getByRole('heading', { name: 'Select an address' });
  }

  /** The row of an address, by the name it was saved under. */
  address(fullName: string): Locator {
    return this.page.getByRole('row').filter({ hasText: fullName });
  }

  /** The radio of an address's row, whatever it is named. */
  radio(fullName: string): Locator {
    return this.address(fullName).getByRole('radio');
  }

  /** The radio named after an address, which no radio is until LOCAL-9 is fixed. */
  radioNamed(fullName: string): Locator {
    return this.page.getByRole('radio', { name: fullName });
  }

  addresses(): Locator {
    return this.page.getByRole('row').filter({ has: this.page.getByRole('radio') });
  }

  async choose(fullName: string): Promise<void> {
    await this.address(fullName).getByRole('radio').click();
  }

  addNew(): Locator {
    return this.page.getByRole('button', { name: 'Add a new address' });
  }

  /**
   * Shows "Continue"; its accessible name names the wrong step. Found by that name until LOCAL-10
   * is fixed, when this locator stops matching and changes with the fix.
   */
  proceed(): Locator {
    return this.page.getByRole('button', { name: 'Proceed to payment selection' });
  }

  /** The same button found by the text it shows, for a case about its accessible name. */
  continueByText(): Locator {
    return this.page.getByRole('button').filter({ hasText: 'Continue' });
  }
}
