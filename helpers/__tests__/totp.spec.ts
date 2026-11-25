import { expect, test } from '@playwright/test';
import { base32Bytes, freshTotp, msLeftInStep, toBase32, totp } from '../totp';

// The SHA-1 key of RFC 6238 appendix B is the ASCII text of the digits 1 to 0, twice; encoded at
// run time, as an application would show it.
const RFC_KEY = '1234567890'.repeat(2);
const rfcKey = () => toBase32(Buffer.from(RFC_KEY, 'ascii'));

test('the codes of RFC 6238 appendix B, in eight digits and in the six an app shows', () => {
  const vectors: [number, string][] = [
    [59, '94287082'],
    [1_111_111_109, '07081804'],
    [1_111_111_111, '14050471'],
    [1_234_567_890, '89005924'],
    [2_000_000_000, '69279037'],
    [20_000_000_000, '65353130'],
  ];
  for (const [seconds, code] of vectors) {
    expect(totp(rfcKey(), { at: seconds * 1000, digits: 8 }), `T=${seconds}`).toBe(code);
    expect(totp(rfcKey(), { at: seconds * 1000 }), `T=${seconds}, six digits`).toBe(code.slice(2));
  }
});

test('an offset gives the code of a neighbouring step', () => {
  const at = 1_111_111_111_000;
  expect(totp(rfcKey(), { at, offset: -1 })).toBe(totp(rfcKey(), { at: at - 30_000 }));
  expect(totp(rfcKey(), { at, offset: 2 })).toBe(totp(rfcKey(), { at: at + 60_000 }));
  expect(totp(rfcKey(), { at, offset: 1 })).not.toBe(totp(rfcKey(), { at }));
});

test('base32 goes both ways, whatever the case, spacing and padding, and anything else is refused', () => {
  const text = rfcKey();
  expect(text).toMatch(/^[A-Z2-7]{32}$/);
  expect(base32Bytes(text).toString('ascii')).toBe(RFC_KEY);
  const spaced = text.toLowerCase().replace(/(.{4})/g, '$1 ');
  expect(base32Bytes(spaced).toString('ascii')).toBe(RFC_KEY);
  expect(toBase32(Buffer.from('foo'))).toBe('MZXW6');
  expect(base32Bytes('MZXW6===').toString('ascii')).toBe('foo');
  expect(() => base32Bytes('MZXW1')).toThrow(/not base32/);
  expect(() => base32Bytes('')).toThrow(/empty/);
});

test('the time left in a step counts down to the next step', () => {
  expect(msLeftInStep(0)).toBe(30_000);
  expect(msLeftInStep(29_000)).toBe(1_000);
  expect(msLeftInStep(30_000)).toBe(30_000);
  expect(msLeftInStep(10_000, 60)).toBe(50_000);
});

test('a fresh code is made in a step with at least the margin left', async () => {
  const code = await freshTotp(rfcKey(), { marginMs: 1_000 });
  expect(msLeftInStep()).toBeGreaterThanOrEqual(900);
  expect(code).toMatch(/^\d{6}$/);
  expect([totp(rfcKey()), totp(rfcKey(), { offset: -1 })]).toContain(code);
});
