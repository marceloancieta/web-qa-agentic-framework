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
