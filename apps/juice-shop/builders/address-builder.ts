// Addresses for the checkout: made up, unique per call, inside the limits the form measured at
// intake (mobile number 1000000 to 9999999999, ZIP Code up to 8 characters, address up to 160).

import { randomBytes, randomInt } from 'node:crypto';

export interface Address {
  country: string;
  fullName: string;
  mobileNum: number;
  zipCode: string;
  streetAddress: string;
  city: string;
  state?: string;
}

export const ADDRESS_LIMITS = {
  mobileMin: 1_000_000,
  mobileMax: 9_999_999_999,
  zipMax: 8,
  streetMax: 160,
} as const;

const tag = () => randomBytes(3).toString('hex');

export function anAddress(overrides: Partial<Address> = {}): Address {
  const id = tag();
  return {
    country: 'Testland',
    fullName: `Test Customer ${id}`,
    mobileNum: randomInt(5_550_000_000, 5_559_999_999),
    zipCode: String(randomInt(10_000, 99_999)),
    streetAddress: `${randomInt(1, 999)} Example Street ${id}`,
    city: `Sample City ${id}`,
    state: 'Example State',
    ...overrides,
  };
}

/** An address line of exactly `length` characters, unique per call. */
export function longStreet(length: number = ADDRESS_LIMITS.streetMax): string {
  const head = `${randomInt(1, 999)} Long Example Street ${tag()} `;
  return (head + 'x'.repeat(length)).slice(0, length);
}
