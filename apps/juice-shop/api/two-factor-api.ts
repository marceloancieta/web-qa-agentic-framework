// Juice Shop's two-factor endpoints, to arrange and check the setting without the UI
// (docs/features/two-factor.md). While the setting is off, every status call answers a new secret
// with a `setupToken` that binds it, so `enable` sets up with the secret of its own call and
// returns it: the case makes its codes from that secret. With the setting on, the password login
// answers `401` with a pending-login token (`tmpToken`), and the code completes it.

import type { APIRequestContext } from '@playwright/test';
import type { Account } from '../../../helpers/actors';
import { rememberSecret } from '../../../helpers/run-secrets';
import { freshTotp } from '../../../helpers/totp';

export interface TwoFactorStatus {
  setup: boolean;
  /** Only while the setting is off: a new secret on every call. */
  secret?: string;
  setupToken?: string;
}

export class TwoFactorApi {
  /** `api` carries the account's session: the actor's client, or the page's own. */
  constructor(private readonly api: APIRequestContext) {}

  async status(): Promise<TwoFactorStatus> {
    const response = await this.api.get('rest/2fa/status');
    if (!response.ok())
      throw new Error(`The two-factor status did not load: ${response.status()}.`);
    return (await response.json()) as TwoFactorStatus;
  }

  /** Turn the setting on for the session's account and return the secret its codes come from. */
  async enable(password: string): Promise<string> {
    const { setup, secret, setupToken } = await this.status();
    if (setup || !secret || !setupToken) {
      throw new Error('Two-factor authentication is already on for this account.');
    }
    // The redaction reporter removes it from the run's traces and reports.
    rememberSecret(secret);
    const response = await this.api.post('rest/2fa/setup', {
      data: { password, setupToken, initialToken: await freshTotp(secret) },
    });
    if (!response.ok()) {
      throw new Error(`Juice Shop refused the two-factor setup: ${response.status()}.`);
    }
    return secret;
  }

  /**
   * The password step of a login for an account with the setting on: the pending-login token the
   * code completes. Throws when the login does not ask for a code.
   */
  async pendingLogin(account: Account): Promise<string> {
    const response = await this.api.post('rest/user/login', {
      data: { email: account.username, password: account.password },
    });
    const body = (await response.json().catch(() => ({}))) as {
      status?: string;
      data?: { tmpToken?: string };
    };
    if (
      response.status() !== 401 ||
      body.status !== 'totp_token_required' ||
      !body.data?.tmpToken
    ) {
      throw new Error(
        `The login of ${account.username} did not ask for a code: ${response.status()}.`,
      );
    }
    rememberSecret(body.data.tmpToken);
    return body.data.tmpToken;
  }

  /** The code step: whether the server accepted the code for the pending login. */
  async verify(tmpToken: string, code: string): Promise<boolean> {
    const response = await this.api.post('rest/2fa/verify', {
      data: { tmpToken, totpToken: code },
    });
    if (response.ok()) return true;
    // Any refusal of the client's request (401 today) is a refused code, not a broken check.
    if (response.status() >= 400 && response.status() < 500) return false;
    throw new Error(`The code check failed: ${response.status()}.`);
  }
}
