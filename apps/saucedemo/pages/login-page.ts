// The login page at the root of the application.

import type { Locator, Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('');
  }

  form(): Locator {
    return this.page.getByRole('form', { name: 'Login' });
  }

  /** Named by its placeholder: the field has no visible label (contract G1). */
  username(): Locator {
    return this.page.getByRole('textbox', { name: 'Username' });
  }

  /** Named by its placeholder: the field has no visible label (contract G1). */
  password(): Locator {
    return this.page.getByRole('textbox', { name: 'Password' });
  }

  /** Click into the Username field without typing: an interaction that sends nothing. */
  async focusUsername(): Promise<void> {
    await this.username().click();
  }

  loginButton(): Locator {
    return this.page.getByRole('button', { name: 'Login' });
  }

  /** The refusal, announced as an alert. */
  error(): Locator {
    return this.form().getByRole('alert');
  }

  async dismissError(): Promise<void> {
    await this.page.getByRole('button', { name: 'Dismiss error' }).click();
  }

  /** The text fields (Username, Password) the page marks as in error after a refused login. */
  fieldsMarkedInError(): Locator {
    // The mark is only a class and an icon: the fields get no aria-invalid or other attribute a
    // role-based locator could read, so CSS is the only way to see it. Narrowed to the text
    // fields, since the Login button is an input too and could otherwise fill the count.
    return this.form().getByRole('textbox').and(this.form().locator('input.error'));
  }

  /** Fill both fields and press Login; an empty value leaves its field empty. */
  async signIn(username: string, password: string): Promise<void> {
    await this.username().fill(username);
    await this.password().fill(password);
    await this.loginButton().click();
  }
}
