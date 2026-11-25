// Two-factor codes for a case: the right one comes from `helpers/totp.ts`; a wrong one is six
// digits the server cannot accept now, because it is none of the codes of the steps it accepts
// (the current one and one on each side, docs/app-notes.md).

import { totp } from '../../../helpers/totp';

const CANDIDATES = ['000000', '111111', '222222', '333333'];

/** Six digits that are not the code of the step before, the current step or the step after. */
export function aWrongCode(secret: string, at = Date.now()): string {
  const accepted = new Set(
    [-1, 0, 1, 2].map((offset) => totp(secret, { at, offset })), // +2 too: the step may turn
  );
  const wrong = CANDIDATES.find((code) => !accepted.has(code));
  if (!wrong)
    throw new Error('Every candidate is an accepted code: cannot happen with four codes.');
  return wrong;
}
