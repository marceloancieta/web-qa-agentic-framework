// Two-factor tasks shared by the two-factor specs and their visual cases. A flow acts and returns
// what the case needs next; whether each step worked is for the spec to assert.

import type { Page } from '@playwright/test';
import type { Account } from '../../../helpers/actors';
import type { Actor } from '../fixtures';
import { TwoFactorApi } from '../api/two-factor-api';
import { LoginPage } from '../pages/login-page';

export interface TwoFactorCustomer {
  customer: Actor;
  account: Account;
  /** The secret the account's codes come from. */
  secret: string;
}

/**
 * A customer of the case's own with two-factor authentication on, set up through the API. Turning
 * it on changes how the account signs in, so it is never the worker's shared customer.
 */
export async function aTwoFactorCustomer(
  actor: (role?: string, options?: { fresh?: boolean }) => Promise<Actor>,
): Promise<TwoFactorCustomer> {
  const customer = await actor('customer', { fresh: true });
  if (!customer.account) throw new Error('A customer has an account.');
  const secret = await new TwoFactorApi(customer.api).enable(customer.account.password);
  return { customer, account: customer.account, secret };
}

/**
 * The password step of a login through the form, for an account with two-factor authentication
 * on: it ends on the code page, which the shop opens once the password is accepted.
 */
export async function passwordStep(page: Page, account: Account): Promise<void> {
  const login = new LoginPage(page);
  await login.open();
  await login.signIn(account.username, account.password);
  await page.waitForURL(/#\/2fa\/enter$/);
}
