// The dashboard's sign-in page (`/dashboard/login`). The page checks both fields itself when
// "Sign in" is pressed and sends nothing until they pass; the server's refusal shows as a paragraph
// above the fields (contract `docs/features/login.md`).

import type { Locator, Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  /**
   * Open the page and wait until its form is the one that stays: the dashboard asks for a session
   * (`auth/refresh`), the store's setup and the sign-in providers, and draws the form again when
   * they answer, emptying what was typed before. Once they have answered, the form puts the focus
   * in Email (REQ-LOGIN-10). A slow engine filled the first form on a CI runner and pressed
   * "Sign in" on an empty second one.
   */
  async open(): Promise<void> {
    const answered = ['refresh', 'setup', 'providers'].map((call) =>
      this.page.waitForResponse((response) =>
        new URL(response.url()).pathname.endsWith(`/api/v3/admin/auth/${call}`),
      ),
    );
    await this.page.goto('dashboard/login');
    await Promise.all(answered);
    await this.page.waitForFunction(
      () => (document.activeElement as HTMLInputElement | null)?.type === 'email',
    );
  }

  heading(): Locator {
    return this.page.getByRole('heading', { name: 'Welcome back', level: 1 });
  }

  email(): Locator {
    return this.page.getByRole('textbox', { name: 'Email' });
  }

  password(): Locator {
    return this.page.getByRole('textbox', { name: 'Password' });
  }

  /** "Sign in" at rest; while the request runs the same button reads "Signing in…". */
  submit(): Locator {
    return this.page.getByRole('button', { name: 'Sign in', exact: true });
  }

  waiting(): Locator {
    return this.page.getByRole('button', { name: 'Signing in…', exact: true });
  }

  images(): Locator {
    return this.page.getByRole('img');
  }

  forgotPassword(): Locator {
    return this.page.getByRole('link', { name: 'Forgot password?' });
  }

  /** A message the page shows: a field's ("Password is required") or the refusal above them. */
  message(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  /**
   * Where a screen reader would announce `text` from: an `alert` or `status` element, or a live
   * region holding it. A live region has no role of its own, so it is found by its attribute.
   */
  announcement(text: string): Locator {
    return this.page
      .getByRole('alert')
      .or(this.page.getByRole('status'))
      .or(this.page.locator('[aria-live]:not([aria-live="off"])')) // live regions have no role
      .filter({ hasText: text });
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

  /**
   * The field while the browser's own check refuses what it holds (`type=email` refuses an address
   * without its shape before the page sees it; docs/app-notes.md). The constraint state has no
   * role or attribute, only the `:invalid` pseudo-class.
   */
  refusedByBrowser(field: Locator): Locator {
    return field.and(this.page.locator(':invalid')); // constraint state: a pseudo-class only
  }

  /**
   * The field while it is exposed as required, by `required` or `aria-required`; neither shows in
   * the accessibility tree Playwright reads by role.
   */
  required(field: Locator): Locator {
    return field.and(this.page.locator(':required, [aria-required="true"]')); // attributes only
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.email().fill(email);
    await this.password().fill(password);
    await this.submit().click();
  }
}
