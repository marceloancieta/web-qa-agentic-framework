// Passwords of a chosen length and tokens Spree never issued, for the password reset cases
// (registry/password-reset.md). Every password is remembered for the run, so the redaction reporter
// removes it from the artifacts even when a case types it.

import { randomBytes } from 'node:crypto';
import { rememberSecret } from '../../../helpers/run-secrets';

/** The fewest characters the reset page accepts for a new password (REQ-PWRESET-06). */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * A password of exactly `length` characters (<PASSWORD_7>, <PASSWORD_8>), with a capital, a small
 * letter, a digit and a symbol, random in the rest. `length` is 6 at least, so the run can redact
 * it.
 */
export function aPasswordOfLength(length: number): string {
  if (length < 6) throw new Error('aPasswordOfLength: 6 characters at least, so it is redacted.');
  const password = `Qa9-${randomBytes(length).toString('base64url')}`.slice(0, length);
  rememberSecret(password);
  return password;
}

/** A token-shaped value that Spree never issued (<MADE_UP_TOKEN>): it signs no one in. */
export function aMadeUpToken(): string {
  return `qa-made-up-${randomBytes(24).toString('base64url')}`;
}
