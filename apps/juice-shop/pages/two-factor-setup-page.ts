// The two-factor setup page (`/#/privacy-security/two-factor-authentication`), signed in. With the
// setting off it shows the QR code and the setup form; with it on, the removal form. Juice Shop
// labels its fields with descriptive accessible names.
//
// The page keeps the secret and the `setupToken` of its status answer only once the application
// configuration has answered too, and a setup sent before that goes without the token and is
// refused (docs/app-notes.md). The QR code is drawn from the same answer, so `openForSetup` waits
// until the code is drawn before it hands the secret back.

import type { Locator, Page } from '@playwright/test';
import { rememberSecret } from '../../../helpers/run-secrets';

const ROUTE = '#/privacy-security/two-factor-authentication';

export class TwoFactorSetupPage {
  constructor(private readonly page: Page) {}

  /** Open the page in whatever state the account is in. */
  async open(): Promise<void> {
    await this.page.goto(ROUTE);
  }

  /**
   * Open the page of an account with the setting off and return the secret the page received, once
   * the page can send the setup: the secret its QR code encodes and its codes come from.
   */
  async openForSetup(): Promise<string> {
    return this.secretAfter(() => this.page.goto(ROUTE));
  }

  /** The same after a reload: a reload asks for a new secret, and the old one no longer sets up. */
  async reloadForSetup(): Promise<string> {
    return this.secretAfter(() => this.page.reload());
  }

  private async secretAfter(load: () => Promise<unknown>): Promise<string> {
    const status = this.page.waitForResponse(
      (response) => response.url().includes('/rest/2fa/status') && response.ok(),
    );
    await load();
    const { secret } = (await (await status).json()) as { secret?: string };
    if (!secret) throw new Error('The setup page received no secret: is the setting already on?');
    // The redaction reporter removes it from the run's traces and reports.
    rememberSecret(secret);
    await this.qrDrawn();
    return secret;
  }

  /** Reload in whatever state the account is in; to set up afterwards, use `reloadForSetup`. */
  async reload(): Promise<void> {
    await this.page.reload();
  }

  /** Wait until the QR code has dark, opaque modules on its canvas (a blank canvas reads 0,0,0,0). */
  async qrDrawn(): Promise<void> {
    await this.qrCode().waitFor();
    await this.qrCode().evaluate(
      (canvas: HTMLCanvasElement) =>
        new Promise<void>((resolve) => {
          const drawn = () => {
            const context = canvas.getContext('2d');
            if (!context || canvas.width === 0) return false;
            const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < data.length; i += 4) {
              if ((data[i + 3] as number) > 0 && (data[i] as number) < 128) return true;
            }
            return false;
          };
          const check = () => (drawn() ? resolve() : requestAnimationFrame(check));
          check();
        }),
    );
  }

  title(): Locator {
    return this.page.getByRole('heading', { name: '2FA Configuration', level: 1, exact: true });
  }

  instructions(): Locator {
    return this.page.getByText(
      'Secure your account with an additional factor. Scan the QR code into an authenticator app supporting TOTP (e.g. Google Authenticator) to get started.',
      { exact: true },
    );
  }

  /** The QR code's canvas: it has no role or name (LOCAL-60), so the component holds it. */
  qrCode(): Locator {
    return this.page.locator('qrcode canvas'); // no role or name: LOCAL-60
  }

  /**
   * The QR code as an assistive technology would find it: an image inside the QR component,
   * whatever its name. The component itself has no role, so it scopes the search.
   */
  qrImage(): Locator {
    return this.page.locator('qrcode').getByRole('img'); // the component has no role or name
  }

  /**
   * The secret written out on the page, where a customer who cannot scan would read it: its
   * characters in order, in groups or not.
   */
  secretText(secret: string): Locator {
    return this.page.getByText(new RegExp(secret.split('').join('\\s*')));
  }

  /** The message under Current Password, whatever it says; Material gives it no role. */
  passwordMessage(): Locator {
    return this.passwordField().locator('mat-error'); // no role: Material's field message
  }

  /** The message under Initial Token, whatever it says. */
  tokenMessage(): Locator {
    return this.tokenField().locator('mat-error'); // no role: Material's field message
  }

  password(): Locator {
    return this.page.getByRole('textbox', { name: 'Field to enter the current password' });
  }

  token(): Locator {
    return this.page.getByRole('textbox', {
      name: 'Field to enter the initial token. This must have 6 digits.',
    });
  }

  save(): Locator {
    return this.page.getByRole('button', {
      name: 'Button to complete the two-factor configuration',
    });
  }

  /** The form field around each input, where Angular Material draws the focus indicator. */
  passwordField(): Locator {
    return this.page.locator('mat-form-field').filter({ has: this.password() }); // no role or name
  }

  tokenField(): Locator {
    return this.page.locator('mat-form-field').filter({ has: this.token() }); // no role or name
  }

  enabled(): Locator {
    return this.page.getByText(
      'You have enabled 2FA for your account. Thank you for taking the time to keep your juices safe!',
      { exact: true },
    );
  }

  removalTitle(): Locator {
    return this.page.getByRole('heading', {
      name: 'Remove 2FA from your account',
      level: 2,
      exact: true,
    });
  }

  remove(): Locator {
    return this.page.getByRole('button', {
      name: 'Button to remove the two-factor authentication',
    });
  }

  failure(): Locator {
    return this.page.getByText(
      'Failed to change 2FA setup. Check if you entered your password (and token) correctly.',
      { exact: true },
    );
  }

  setUpConfirmation(): Locator {
    return this.page.getByText('Setup of Two-Factor Authentication successfully completed.', {
      exact: true,
    });
  }

  removedConfirmation(): Locator {
    return this.page.getByText('Two-Factor Authentication has been removed.', { exact: true });
  }

  /** A field's message, such as "The token appears to be invalid.". The page has no landmarks. */
  message(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  /** What the visual check hides: the QR code changes with every secret. */
  masks(): Locator[] {
    return [this.qrCode()];
  }

  /** Fill the setup form and send it. Whether the setting changed is for the spec to check. */
  async setUp(password: string, code: string): Promise<void> {
    await this.password().fill(password);
    await this.token().fill(code);
    await this.save().click();
  }

  /** Fill the removal form and send it. */
  async removeWith(password: string): Promise<void> {
    await this.password().fill(password);
    await this.remove().click();
  }
}
