// Payment cards for the checkout. The number starts with 9, a major industry identifier no card
// issuer uses, so it can never be a real card, and it is made while the test runs. The prefix 9000
// also keeps every sixteen-digit number (at most 9000999999999999) below Number.MAX_SAFE_INTEGER
// (9007199254740991), as the API stores it as a number.

import { randomBytes, randomInt } from 'node:crypto';

export interface Card {
  fullName: string;
  cardNum: number;
  expMonth: number;
  expYear: number;
}

/** `length` digits starting with 9000, as typed into the card form (boundaries: 15, 16, 17). */
export function cardDigits(length = 16): string {
  let digits = '9000';
  while (digits.length < length) digits += String(randomInt(0, 10));
  return digits.slice(0, length);
}

/**
 * The whole number as a page could show it: run together or in groups split by spaces or dashes
 * ("9000 1234 5678 9012"). For a check that the number appears nowhere.
 */
export function wholeNumberPattern(card: Pick<Card, 'cardNum'>): RegExp {
  return new RegExp(String(card.cardNum).split('').join('[\\s-]?'));
}

/** A holder name of exactly `length` characters, unique per call, for long-text cases. */
export function longHolderName(length: number): string {
  const head = `Long Holder ${randomBytes(3).toString('hex')} `;
  return (head + 'Name'.repeat(length)).slice(0, length);
}

export const lastFour = (card: Pick<Card, 'cardNum'>): string => String(card.cardNum).slice(-4);

export function aCard(overrides: Partial<Card> = {}): Card {
  return {
    fullName: `Test Holder ${randomBytes(3).toString('hex')}`,
    cardNum: Number(cardDigits(16)),
    expMonth: randomInt(1, 13),
    expYear: randomInt(2080, 2100),
    ...overrides,
  };
}
