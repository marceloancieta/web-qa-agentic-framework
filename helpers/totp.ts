// Time-based one-time codes (TOTP, RFC 6238) for cases about two-factor sign-in. The test holds the
// account's secret, as an authenticator app would, and makes the code itself: HMAC-SHA1 over the
// number of the time step, 30-second steps, six digits by default. The secret is the base32 text an
// application shows or encodes in its `otpauth://` QR code.
//
// The code depends on the real clock, which the application's server reads too; `page.clock` moves
// only the browser's. A code made near the end of its step can reach the server in the next one,
// so a case that needs a code to stay current, or a neighbouring step to stay a neighbour, asks for
// `freshTotp`, which waits for a new step when too little of the current one is left.

import { createHmac } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export interface TotpOptions {
  /** The moment the code is for, in milliseconds since the epoch. Default: now. */
  at?: number;
  /** Steps away from the step of `at`: -1 is the code before, 1 the code after. Default: 0. */
  offset?: number;
  /** Seconds per step. Default: 30. */
  step?: number;
  /** Digits of the code. Default: 6. */
  digits?: number;
}

/** The bytes a base32 secret stands for; spaces, case and `=` padding are ignored. */
export function base32Bytes(secret: string): Buffer {
  const clean = secret.replace(/[\s=]/g, '').toUpperCase();
  let bits = '';
  for (const char of clean) {
    const value = BASE32.indexOf(char);
    if (value < 0)
      throw new Error('The TOTP secret is not base32: it holds a character outside A-Z, 2-7.');
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  if (bytes.length === 0) throw new Error('The TOTP secret is empty.');
  return Buffer.from(bytes);
}

/** The base32 text of some bytes, unpadded: what an application shows as a secret. */
export function toBase32(bytes: Uint8Array): string {
  const bits = Array.from(bytes, (byte) => byte.toString(2).padStart(8, '0')).join('');
  let text = '';
  for (let i = 0; i < bits.length; i += 5)
    text += BASE32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return text;
}

/** The code of a secret for a moment and a step offset (RFC 6238, HMAC-SHA1). */
export function totp(secret: string, options: TotpOptions = {}): string {
  const { at = Date.now(), offset = 0, step = 30, digits = 6 } = options;
  const counter = Math.floor(at / 1000 / step) + offset;
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac('sha1', base32Bytes(secret)).update(message).digest();
  // Dynamic truncation (RFC 4226 section 5.3): four bytes from the offset the last nibble gives.
  const start = (hash[hash.length - 1] as number) & 0x0f;
  const value = hash.readUInt32BE(start) & 0x7fffffff;
  return String(value % 10 ** digits).padStart(digits, '0');
}

/** Milliseconds left in the step that holds `at`. */
export function msLeftInStep(at = Date.now(), step = 30): number {
  const stepMs = step * 1000;
  return stepMs - (at % stepMs);
}

/**
 * A code that stays in its step for at least `marginMs` more: when less of the current step is
 * left, wait for the next step and make the code there. Default margin: 5 seconds.
 */
export async function freshTotp(
  secret: string,
  options: Omit<TotpOptions, 'at'> & { marginMs?: number } = {},
): Promise<string> {
  const { marginMs = 5_000, ...rest } = options;
  const left = msLeftInStep(Date.now(), rest.step);
  if (left < marginMs) await new Promise((resolve) => setTimeout(resolve, left + 50));
  return totp(secret, { ...rest, at: Date.now() });
}
