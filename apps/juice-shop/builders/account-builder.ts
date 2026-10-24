// Accounts created during a run. The email is unique per run and worker; the password is random,
// so nothing reusable ever appears in a trace or a report.

import { generatedPassword, uniqueSuffix, type Account } from '../../../helpers/actors';

export function aCustomer(role: string, worker: number): Account {
  return {
    username: `${role}-${uniqueSuffix(worker)}@example.test`,
    password: generatedPassword(),
  };
}
