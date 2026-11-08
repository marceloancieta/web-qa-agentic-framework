// Accounts created during a run. The email is unique per run and worker; the password is random,
// so nothing reusable ever appears in a trace or a report.

import { randomBytes } from 'node:crypto';
import { generatedPassword, uniqueSuffix, type Account } from '../../../helpers/actors';

/** An answer to the security question asked at sign-up, different per call. */
export const securityAnswer = (): string => `answer-${randomBytes(4).toString('hex')}`;

/**
 * An address that carries markup, and the token that marks what the markup would create. The token
 * is in the id and in the source, so an element made from it keeps the mark if a sanitiser drops one.
 */
export function aMarkupEmail(worker: number): { address: string; token: string } {
  const token = `injected-${uniqueSuffix(worker)}`;
  return { address: `<img id="${token}" src="${token}">@example.test`, token };
}

export function aCustomer(role: string, worker: number): Account {
  return {
    username: `${role}-${uniqueSuffix(worker)}@example.test`,
    password: generatedPassword(),
  };
}

/**
 * A customer whose address has exactly 120 characters and is a valid one: the part before the @ at
 * its limit of 64, and the rest in the domain, whose labels take 63 each.
 */
export function aCustomerWithLongEmail(worker: number): Account {
  const local = `long-${uniqueSuffix(worker)}`.padEnd(64, 'x');
  const domain = 'example.test';
  const label = 'y'.repeat(120 - local.length - '@.'.length - domain.length);
  return { username: `${local}@${label}.${domain}`, password: generatedPassword() };
}
