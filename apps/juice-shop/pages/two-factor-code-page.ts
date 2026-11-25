// The code step of a login (`/#/2fa/enter`), where an account with two-factor authentication on
// enters its six-digit code after the password. It also opens without a pending login.

import type { Locator, Page } from '@playwright/test';

const INVALID = 'The token appears to be invalid.';

export class TwoFactorCodePage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('#/2fa/enter');
  }

  /** The title, which the shop translates after it loads: the sign the page has its texts. */
  title(): Locator {
    return this.page.getByRole('heading', {
      name: 'Two Factor Authentication',
      level: 1,
      exact: true,
    });
  }

  token(): Locator {
    return this.page.getByRole('textbox', { name: 'Field for entering the Two Factor token' });
  }

  submit(): Locator {
    return this.page.getByRole('button', { name: 'Button to confirm the input' });
  }

  /** The form field around the input, where Angular Material draws the focus indicator. */
  tokenField(): Locator {
    return this.page.locator('mat-form-field').filter({ has: this.token() }); // no role or name
  }

  /** The message a refused code shows. The page has no landmarks to scope it to. */
  invalid(): Locator {
    return this.page.getByText(INVALID, { exact: true });
  }

  /** The same message as an alert, the way a screen reader is told about it. */
  invalidAlert(): Locator {
    return this.page.getByRole('alert').filter({ hasText: INVALID });
  }

  /** Enter a code and send it. Whether it signed in is for the spec to check. */
  async enter(code: string): Promise<void> {
    await this.token().fill(code);
    await this.submit().click();
  }
}
