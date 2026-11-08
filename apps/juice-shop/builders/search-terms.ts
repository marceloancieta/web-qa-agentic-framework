// Search terms for the search cases: unique per call where a run could otherwise collide, and at
// the boundaries the contract names.

import { randomBytes } from 'node:crypto';
import { uniqueSuffix } from '../../../helpers/actors';

/** A term no product name contains: letters and digits no catalogue name holds. */
export const noMatchTerm = (worker: number): string => `no-match-${uniqueSuffix(worker)}`;

/** Harmless markup: if the page builds an element from it, a `<b>` appears. Never a script. */
export const markupTerm = (): string => `<b>bold-${randomBytes(2).toString('hex')}</b>`;

/**
 * A term with each character that needs escaping in a URL: `&`, `#`, `%` and a space. Unique per
 * call, so no product name or description holds it.
 */
export const escapingTerm = (): string => `a&b #c 50% ${randomBytes(2).toString('hex')}`;

/** A term of exactly `length` characters, for the long-text cases. */
export function longTerm(length: number): string {
  const head = `long-term-${randomBytes(3).toString('hex')}-`;
  return (head + 'x'.repeat(length)).slice(0, length);
}
