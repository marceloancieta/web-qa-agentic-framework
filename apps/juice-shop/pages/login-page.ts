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

  /**
   * The form field around each input, where Angular Material draws the focus indicator. The
   * wrapper has no role or name of its own, so it is the form field that holds the input.
   */
  emailField(): Locator {
    return this.page.locator('mat-form-field').filter({ has: this.email() }); // no role or name
  }

  passwordField(): Locator {
    return this.page.locator('mat-form-field').filter({ has: this.password() }); // no role or name
  }

  showPassword(): Locator {
    return this.page.getByRole('button', { name: 'Show password' });
  }

  /** The same button once the password shows: its name says what the next press does. */
  hidePassword(): Locator {
    return this.page.getByRole('button', { name: 'Hide password' });
  }

  forgotPassword(): Locator {
    return this.page.getByRole('link', { name: 'Forgot your password?' });
  }

  notYetACustomer(): Locator {
    return this.page.getByRole('link', { name: 'Not yet a customer?' });
  }

  /** The title, which the shop translates after it loads: the sign the page has its texts. */
  title(): Locator {
    return this.page.getByRole('heading', { name: 'Login', level: 1, exact: true });
  }

  /** A progress indicator anywhere on the page. */
  loading(): Locator {
    return this.page.getByRole('progressbar');
  }

  /** Any message announced anywhere on the page, the overlay of a notification included. */
  notice(): Locator {
    return this.page
      .getByRole('alert')
      .or(this.page.getByRole('status'))
      .or(this.page.locator('mat-snack-bar-container')); // a notification has no role in Chromium
  }

  /** Any alert the form shows, whatever its text: the sign that a refused login was handled. */
  anyAlert(): Locator {
    return this.page.getByRole('main').getByRole('alert');
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
