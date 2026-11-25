// The dashboard's request for a password reset (`/dashboard/forgot-password`). The page checks
// Email itself when "Send reset link" is pressed; any well-formed address gets the same
// confirmation, which replaces the form (contract `docs/features/password-reset.md`).

import type { Locator, Page } from '@playwright/test';

export class ForgotPasswordPage {
  constructor(private readonly page: Page) {}

  /**
   * Open the page and wait until its form is the one that stays: like the login, the page asks
   * for a session (`auth/refresh`) and draws the form again when it answers, then puts the focus
   * in Email (REQ-PWRESET-01).
   */
  async open(): Promise<void> {
    const refreshed = this.page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/api/v3/admin/auth/refresh'),
    );
    await this.page.goto('dashboard/forgot-password');
    await refreshed;
    await this.page.waitForFunction(
      () => (document.activeElement as HTMLInputElement | null)?.type === 'email',
    );
  }

  heading(): Locator {
    return this.page.getByRole('heading', { name: 'Reset your password', level: 1 });
  }

  email(): Locator {
    return this.page.getByRole('textbox', { name: 'Email' });
  }

  send(): Locator {
    return this.page.getByRole('button', { name: 'Send reset link', exact: true });
  }

  backToSignIn(): Locator {
    return this.page.getByRole('link', { name: 'Back to sign in' });
  }

  /** The confirmation's title, "Check your email": plain text, with no heading or status role. */
  confirmation(): Locator {
    return this.page.getByText('Check your email', { exact: true });
  }

  /** The sentence under the confirmation's title. */
  confirmationText(): Locator {
    return this.page.getByText(
      'If an account exists for that email, a password reset link is on its way.',
      { exact: true },
    );
  }

  /** A message the page shows, such as "Invalid email address" under Email. */
  message(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  /** Where a screen reader would announce `text` from: an alert, a status or a live region. */
  announcement(text: string): Locator {
    return (
      this.page
        .getByRole('alert')
        .or(this.page.getByRole('status'))
        .or(this.page.locator('[aria-live]:not([aria-live="off"])')) // live regions have no role
        .filter({ hasText: text })
        // A status item inside a live region matches twice; any announcing container is the claim.
        .first()
    );
  }

  images(): Locator {
    return this.page.getByRole('img');
  }

  async request(email: string): Promise<void> {
    await this.email().fill(email);
    await this.send().click();
  }
}
