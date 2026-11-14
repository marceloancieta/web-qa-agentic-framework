// Staff members and the roles they hold. Every address is unique per run and worker and uses the
// reserved `example.test` domain; every password comes from `generatedPassword()`, so the run knows
// it and the redaction reporter removes it from the artifacts.

import { generatedPassword, uniqueSuffix, type Account } from '../../../helpers/actors';

/**
 * The permissions each provisioned actor's role holds (contracts `docs/features/login.md` and
 * `docs/features/roles.md`, roles and entry state). `staff` is any member who signs in: reading
 * orders gives it the dashboard's home and one section.
 */
export const ROLE_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  staff: ['read_orders'],
  'orders-reader': ['read_orders'],
  'catalog-editor': ['read_products', 'write_products'],
};

/** A staff member for `role`, not created yet. */
export function aStaffMember(role: string, worker: number): Account {
  return {
    username: `${role}-${uniqueSuffix(worker)}@example.test`,
    password: generatedPassword(),
  };
}

/** An address the run never invites (<UNKNOWN_EMAIL>). */
export function anUnknownEmail(worker: number): string {
  return `unknown-${uniqueSuffix(worker)}@example.test`;
}

/**
 * The name a member is created with, and the dashboard shows in the user menu: "Qa" and the local
 * part of the address, so each member's name is unique and readable.
 */
export function staffName(account: Pick<Account, 'username'>): { first: string; last: string } {
  return { first: 'Qa', last: account.username.split('@')[0] ?? account.username };
}

/** The machine name of the role a member is made in: Spree names roles in lower snake case. */
export function roleName(account: Pick<Account, 'username'>): string {
  return `qa_${staffName(account)
    .last.replace(/[^a-z0-9]+/gi, '_')
    .toLowerCase()}`;
}
