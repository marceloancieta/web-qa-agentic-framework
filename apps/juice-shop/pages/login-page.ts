// The login page (`/#/login`). Juice Shop labels its fields with descriptive accessible names.

import type { Locator, Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('#/login');
  }

  email(): Locator {
    return this.page.getByRole('textbox', { name: 'Text field for the login email' });
  }

  password(): Locator {
    return this.page.getByRole('textbox', { name: 'Text field for the login password' });
  }

  submit(): Locator {
    return this.page.getByRole('button', { name: 'Login', exact: true });
  }

  /** A field's message once it was left empty, such as "Please provide an email address.". */
  message(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  /** The message as an alert, the way a screen reader is told about it. */
  alert(): Locator {
    return this.page.getByRole('alert').filter({ hasText: 'Invalid email or password.' });
  }

  /** The message shown when the server refuses the credentials. */
  error(): Locator {
    return this.page.getByRole('main').getByText('Invalid email or password.', { exact: true });
  }

  /** Fill the form and send it. Whether the login worked is for the spec to check. */
  async signIn(email: string, password: string): Promise<void> {
    const entries: [Locator, string][] = [
      [this.email(), email],
      [this.password(), password],
    ];
    for (const [field, value] of entries) await field.fill(value);
    await this.submit().click();
  }
}
