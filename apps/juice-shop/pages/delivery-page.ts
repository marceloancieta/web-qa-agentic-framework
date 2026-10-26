// The delivery step (`/#/delivery-method`): the chosen address, then a table of methods whose radios
// have no accessible name (LOCAL-9), so a method is found by its row.

import type { Locator, Page } from '@playwright/test';

export type DeliveryMethod = 'One Day Delivery' | 'Fast Delivery' | 'Standard Delivery';

export class DeliveryPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('#/delivery-method');
  }

  heading(): Locator {
    return this.page.getByRole('heading', { name: 'Choose a delivery speed' });
  }

  /**
   * A part of the chosen address the step repeats under "Delivery Address" (the name, the street,
   * the mobile number). The address is one block of text, so a part is matched inside it.
   */
  deliveryAddress(part: string): Locator {
    return this.page.getByText(part, { exact: false });
  }

  method(name: DeliveryMethod): Locator {
    return this.page.getByRole('row').filter({ hasText: name });
  }

  async choose(name: DeliveryMethod): Promise<void> {
    await this.method(name).getByRole('radio').click();
  }

  back(): Locator {
    return this.page.getByRole('button', { name: 'Back', exact: true });
  }

  /**
   * Shows "Continue"; its accessible name names the wrong step. Found by that name until LOCAL-10
   * is fixed, when this locator stops matching and changes with the fix.
   */
  proceed(): Locator {
    return this.page.getByRole('button', { name: 'Proceed to delivery method selection' });
  }

  /** The same button found by the text it shows, for a case about its accessible name. */
  continueByText(): Locator {
    return this.page.getByRole('button').filter({ hasText: 'Continue' });
  }
}
