// The dashboard's page for a new password (`/dashboard/reset-password?token=…`), opened from the
// reset email. It shows the form for any token and checks the token only when "Reset password" is
// pressed; without a token it shows "Invalid reset link" instead (contract
// `docs/features/password-reset.md`). The page has no heading (LOCAL-68).

import type { Locator, Page } from '@playwright/test';

/** The address the reset page has under the dashboard. */
export const RESET_PATH = '/dashboard/reset-password';

/** The token a reset link carries in its query. */
export function tokenOf(link: string): string {
  const token = new URL(link).searchParams.get('token');
  if (!token) throw new Error('The reset link carries no token.');
  return token;
}

export class ResetPasswordPage {
  constructor(private readonly page: Page) {}

  /**
   * Open the reset page for `token` (any string, valid or not) and wait for its form, whose first
   * field takes the focus (REQ-PWRESET-06).
   */
  async open(token: string): Promise<void> {
    await this.page.goto(`${RESET_PATH.slice(1)}?token=${encodeURIComponent(token)}`);
    await this.waitForForm();
  }

  /**
   * Open the reset page for `token` and wait for whatever it shows first: the form, or a page that
   * refuses the link. For the case about what a dead link shows when it opens (LOCAL-69), where
   * waiting for the form would assume the answer.
   */
  async visit(token: string): Promise<void> {
    await this.page.goto(`${RESET_PATH.slice(1)}?token=${encodeURIComponent(token)}`);
    await this.newPassword().or(this.requestNewLink()).first().waitFor();
  }

  /** Open the reset page without a token, which shows "Invalid reset link" (REQ-PWRESET-11). */
  async openWithoutToken(): Promise<void> {
    await this.page.goto(RESET_PATH.slice(1));
    await this.requestNewLink().waitFor();
  }

  /**
   * Open the link of a reset email. The email's link leads to `/reset-password`, without the
   * `/dashboard` the page is served under, and answers 404 (LOCAL-67); its token is opened on the
   * dashboard's reset page instead. Until LOCAL-67 is fixed: once the email's link opens the form
   * (TC-PWRESET-05), this goes back to opening the link as given.
   */
  async openLink(link: string): Promise<void> {
    await this.open(tokenOf(link));
  }

  /** Open the email's link exactly as the email gives it, for the case about the link itself. */
  async openAsSent(link: string): Promise<void> {
    await this.page.goto(link);
  }

  private async waitForForm(): Promise<void> {
    await this.page.waitForFunction(
      () => (document.activeElement as HTMLInputElement | null)?.name === 'password',
    );
  }

  /** "Choose a new password": the page's title, plain text (LOCAL-68). */
  title(): Locator {
    return this.page.getByText('Choose a new password', { exact: true });
  }

  /** The page's level-1 heading, which it lacks (LOCAL-68). */
  heading(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  newPassword(): Locator {
    return this.page.getByRole('textbox', { name: 'New password', exact: true });
  }

  confirmPassword(): Locator {
    return this.page.getByRole('textbox', { name: 'Confirm new password', exact: true });
  }

  submit(): Locator {
    return this.page.getByRole('button', { name: 'Reset password', exact: true });
  }

  /** A message the page shows, such as "Passwords do not match" or the token's refusal. */
  message(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  /**
   * A field's message shown with that field: the box that holds the field and the message, and not
   * the other field. The page ties no message to its field for assistive technology (LOCAL-45), so
   * the box is the only handle; it has no role or name of its own.
   */
  fieldMessage(field: Locator, other: Locator, text: string): Locator {
    return this.page
      .locator('div') // the field's box has no role or name (LOCAL-45)
      .filter({ has: field })
      .filter({ hasNot: other })
      .getByText(text, { exact: true });
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

  /**
   * Any text that tells the link is no good: "Invalid reset link" without a token, the token's
   * refusal, or wording a fixed LOCAL-69 may bring for a dead token when it opens.
   */
  linkRefused(): Locator {
    // A title and its sentence can both say so; any one of them is the claim.
    return this.page.getByText(/invalid|expired/i).first();
  }

  /** "Invalid reset link", shown without a token. */
  invalidLink(): Locator {
    return this.page.getByText('Invalid reset link', { exact: true });
  }

  missingToken(): Locator {
    return this.page.getByText('This password reset link is missing its token.', { exact: true });
  }

  requestNewLink(): Locator {
    return this.page.getByRole('link', { name: 'Request a new reset link' });
  }

  images(): Locator {
    return this.page.getByRole('img');
  }

  /** Type `password` in both fields, or `confirmation` in the second, and press "Reset password". */
  async choose(password: string, confirmation = password): Promise<void> {
    await this.newPassword().fill(password);
    await this.confirmPassword().fill(confirmation);
    await this.submit().click();
  }
}
