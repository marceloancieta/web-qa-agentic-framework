// The registration form (`/#/register`). Its fields carry descriptive accessible names; the security
// question is a list box that opens its options.

import type { Locator, Page } from '@playwright/test';

export class RegisterPage {
  constructor(private readonly page: Page) {}

  /**
   * Open the form once its security questions have arrived: a list opened before that stays empty
   * even after they come.
   */
  async open(): Promise<void> {
    const questions = this.page.waitForResponse((r) => r.url().includes('/api/SecurityQuestions'));
    await this.page.goto('#/register');
    await questions;
  }

  heading(): Locator {
    return this.page.getByRole('heading', { name: 'User Registration' });
  }

  submit(): Locator {
    return this.page.getByRole('button', { name: 'Button to complete the registration' });
  }

  /** Fill the form with the first security question of the list, and send it. */
  async register(email: string, password: string, answer: string): Promise<void> {
    await this.page.getByRole('textbox', { name: 'Email address field' }).fill(email);
    await this.page.getByRole('textbox', { name: 'Field for the password' }).fill(password);
    await this.page.getByRole('textbox', { name: 'Field to confirm the password' }).fill(password);
    await this.page
      .getByRole('combobox', { name: 'Selection list for the security question' })
      .click();
    await this.page.getByRole('option').first().click(); // any question will do; the first is always there
    // The list's overlay takes a moment to close and swallows a click sent while it does.
    await this.page.getByRole('listbox').waitFor({ state: 'hidden' });
    await this.page
      .getByRole('textbox', { name: 'Field for the answer to the security question' })
      .fill(answer);
    await this.submit().click();
  }
}
