// Accounts created during a run. The email is unique per run and worker; the password is random,
// so nothing reusable ever appears in a trace or a report.

import { randomBytes } from 'node:crypto';
import { generatedPassword, uniqueSuffix, type Account } from '../../../helpers/actors';

/** An answer to the security question asked at sign-up, different per call. */
export const securityAnswer = (): string => `answer-${randomBytes(4).toString('hex')}`;

export function aCustomer(role: string, worker: number): Account {
  return {
    username: `${role}-${uniqueSuffix(worker)}@example.test`,
    password: generatedPassword(),
  };
}
