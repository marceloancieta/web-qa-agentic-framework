// The payment step (`/#/payment/shop`): the saved cards, each a row whose radio has no accessible
// name (LOCAL-9), and the new card form behind an expansion panel.

import type { Locator, Page } from '@playwright/test';
import type { Card } from '../builders/card-builder';

export class PaymentPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('#/payment/shop');
  }

  heading(): Locator {
    return this.page.getByRole('heading', { name: 'My Payment Options' });
  }

  async openNewCard(): Promise<void> {
    await this.page
      .getByRole('button', { name: 'Add new card Add a credit or debit card' })
      .click();
  }

  private form(): Locator {
    return this.page.getByRole('region', { name: 'Add new card Add a credit or debit card' });
  }

  name(): Locator {
    return this.form().getByRole('textbox', { name: 'Name' });
  }

  number(): Locator {
    return this.form().getByRole('spinbutton', { name: 'Card Number' });
  }

  message(text: string): Locator {
    return this.form().getByText(text, { exact: true });
  }

  submit(): Locator {
    return this.form().getByRole('button', { name: 'Submit' });
  }

  /** Fill the new card form; the number as typed, so a case can type 15 or 17 digits. */
  async fill(card: Card, digits = String(card.cardNum)): Promise<void> {
    await this.name().fill(card.fullName);
    await this.number().fill(digits);
    await this.form()
      .getByRole('combobox', { name: 'Expiry Month' })
      .selectOption(String(card.expMonth));
    await this.form()
      .getByRole('combobox', { name: 'Expiry Year' })
      .selectOption(String(card.expYear));
  }

  /** Leave the form's fields, so it shows what is missing or wrong. */
  async leaveFields(): Promise<void> {
    await this.name().focus();
    await this.number().focus();
    await this.heading().click();
  }

  /** The row of a saved card, by its last four digits. */
  card(lastFour: string): Locator {
    return this.page.getByRole('row').filter({ hasText: `************${lastFour}` });
  }

  async choose(lastFour: string): Promise<void> {
    await this.card(lastFour).getByRole('radio').click();
  }

  /** Any text on the page that contains `part`, for a check that something appears nowhere. */
  text(part: string | RegExp): Locator {
    return this.page.getByText(part, { exact: false });
  }

  notification(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  back(): Locator {
    return this.page.getByRole('button', { name: 'Back', exact: true });
  }

  /** Shows "Continue"; found by its accessible name until LOCAL-10 is fixed. */
  proceed(): Locator {
    return this.page.getByRole('button', { name: 'Proceed to review' });
  }

  /** The same button found by the text it shows, for a case about its accessible name. */
  continueByText(): Locator {
    return this.page.getByRole('button').filter({ hasText: 'Continue' });
  }
}
