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

  /**
   * The address of the member whose session this context holds, or null without one. It trades the
   * context's refresh cookie for an access token, as the dashboard does on a page load, so with a
   * page's own request context (`page.request`) it reads the page's session; the rotated cookie
   * goes back into the same context, which the page shares.
   */
  async whoami(): Promise<string | null> {
    const refresh = await this.api.post('api/v3/admin/auth/refresh');
    if (refresh.status() === 401) return null;
    if (!refresh.ok()) throw new Error(`Spree session refresh answered ${refresh.status()}.`);
    const { token } = (await refresh.json()) as { token: string };
    const me = await this.api.get('api/v3/admin/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!me.ok()) throw new Error(`Spree admin me answered ${me.status()}.`);
    const body = (await me.json()) as { email?: string; user?: { email?: string } };
    return body.email ?? body.user?.email ?? null;
  }

  /**
   * The status a sign-in with `account` answers, without keeping its session: `200` for a right
   * pair, `401` for a refused one. For a case that checks which password an account has.
   */
  async signInStatus(account: Account): Promise<number> {
    const response = await this.api.post('api/v3/admin/auth/login', {
      data: { email: account.username, password: account.password },
    });
    return response.status();
  }

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
