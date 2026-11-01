// Credentials the refused-login cases type. Each is made for the run, so no case writes a user name
// or a password, and the password is one the redaction reporter knows.

import { generatedPassword, uniqueSuffix } from '../../../helpers/actors';

/** A user name the application does not accept, unique per run and worker. */
export function anUnknownUser(worker: number): string {
  return `unknown-user-${uniqueSuffix(worker)}`;
}

/** A password generated for the run, never the one the application accepts. */
export function aWrongPassword(): string {
  return generatedPassword();
}
