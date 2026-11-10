// Spree's admin authentication (`/api/v3/admin/auth`). A sign-in answers with an access token
// (a JWT for the Authorization header, short-lived) and sets the refresh cookie, which the
// dashboard trades for a new access token when it loads. The refresh cookie is rotated on every
// use and the old one is refused, so one sign-in opens one browser context (docs/app-notes.md).

import type { APIRequestContext } from '@playwright/test';
import type { Account } from '../../../helpers/actors';

export const REFRESH_COOKIE = 'spree_admin_refresh_token';

export interface AdminSignIn {
  token: string;
  refresh: { value: string; path: string; expires: number };
}

export class AuthApi {
  constructor(private readonly api: APIRequestContext) {}

  async login(account: Account): Promise<AdminSignIn> {
    const response = await this.api.post('api/v3/admin/auth/login', {
      data: { email: account.username, password: account.password },
    });
    if (response.status() !== 200) {
      throw new Error(`Spree admin sign-in of the actor's account failed: ${response.status()}`);
    }
    const { token } = (await response.json()) as { token: string };
    const header = response
      .headersArray()
      .find(
        ({ name, value }) =>
          name.toLowerCase() === 'set-cookie' && value.startsWith(`${REFRESH_COOKIE}=`),
      );
    if (!header) throw new Error(`Spree admin sign-in set no ${REFRESH_COOKIE} cookie.`);
    const [pair = '', ...attributes] = header.value.split(';').map((part) => part.trim());
    const attribute = (name: string) =>
      attributes.find((part) => part.toLowerCase().startsWith(`${name}=`))?.slice(name.length + 1);
    const expires = attribute('expires');
    return {
      token,
      refresh: {
        value: pair.slice(REFRESH_COOKIE.length + 1),
        path: attribute('path') ?? '/',
        expires: expires ? Math.floor(Date.parse(expires) / 1000) : -1,
      },
    };
  }
}
