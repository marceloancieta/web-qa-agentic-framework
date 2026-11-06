// The new address form (`/#/address/create`). Every field is labelled; State is the one that is not
// required.

import type { Locator, Page } from '@playwright/test';
import type { Address } from '../builders/address-builder';

export type AddressField =
  'Country' | 'Name' | 'Mobile Number' | 'ZIP Code' | 'Address' | 'City' | 'State';

export class AddressFormPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('#/address/create');
  }

  heading(): Locator {
    return this.page.getByRole('heading', { name: 'Add New Address' });
  }

  field(label: AddressField): Locator {
    return this.page.getByLabel(label, { exact: true });
  }

  /** The message under a field, such as "Please provide a country.". */
  message(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  submit(): Locator {
    return this.page.getByRole('button', { name: 'Submit' });
  }

  async clear(label: AddressField): Promise<void> {
    await this.field(label).clear();
  }

  /** Focus each field and leave it, so the form shows what is missing. */
  async touch(labels: AddressField[]): Promise<void> {
    for (const label of labels) await this.field(label).focus();
    await this.heading().click();
  }

  async fill(address: Address): Promise<void> {
    const values: [AddressField, string | undefined][] = [
      ['Country', address.country],
      ['Name', address.fullName],
      ['Mobile Number', String(address.mobileNum)],
      ['ZIP Code', address.zipCode],
      ['Address', address.streetAddress],
      ['City', address.city],
      ['State', address.state],
    ];
    for (const [label, value] of values)
      if (value !== undefined) await this.field(label).fill(value);
  }

  /** The notification after a save, such as "The address at <city> has been successfully added…". */
  notification(text: RegExp): Locator {
    return this.page.getByText(text);
  }
}
