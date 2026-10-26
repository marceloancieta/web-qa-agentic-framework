// Juice Shop's account endpoints, used to prepare and check state without the UI. The application
// answers a login with a token (sent as a bearer token and kept in a `token` cookie by its
// frontend) and the id of the account's basket (`bid`).

import type { APIRequestContext } from '@playwright/test';
import type { Account } from '../../../helpers/actors';

export interface Authentication {
  token: string;
  bid: number;
  umail: string;
}

export class AccountApi {
  constructor(private readonly api: APIRequestContext) {}

  /** Register a customer account. Juice Shop asks for a security question at sign-up. */
  async register(
    account: Account,
    securityAnswer = 'blue',
  ): Promise<{ id: number; email: string }> {
    const response = await this.api.post('api/Users', {
      data: {
        email: account.username,
        password: account.password,
        passwordRepeat: account.password,
        securityQuestion: { id: 1 },
        securityAnswer,
      },
    });
    if (response.status() !== 201) {
      throw new Error(
        `Juice Shop refused the sign-up of ${account.username}: ${response.status()}.`,
      );
    }
    const { data } = (await response.json()) as { data: { id: number; email: string } };
    return data;
  }

  async login(account: Account): Promise<Authentication> {
    const response = await this.api.post('rest/user/login', {
      data: { email: account.username, password: account.password },
    });
    if (!response.ok()) {
      throw new Error(`Juice Shop refused the login of ${account.username}: ${response.status()}.`);
    }
    return ((await response.json()) as { authentication: Authentication }).authentication;
  }

  /**
   * The signed-in account as the server sees it: its email, or null without a session. With a
   * token, the session that token names instead of the client's own; this call reads the `token`
   * cookie, not the bearer header.
   */
  async whoami(token?: string): Promise<string | null> {
    const response = await this.api.get('rest/user/whoami', {
      headers: token ? { Cookie: `token=${token}` } : {},
    });
    const { user } = (await response.json()) as { user: { email?: string } };
    return user.email ?? null;
  }
}
