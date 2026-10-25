import { expect, test } from '@playwright/test';
import { SLOWED_ACTIONS, slowMoMs, testTimeoutMs } from '../run-options';

test('QA_SLOWMO: unset is full speed, a whole number is milliseconds, anything else is refused', () => {
  expect(slowMoMs({})).toBe(0);
  expect(slowMoMs({ QA_SLOWMO: '0' })).toBe(0);
  expect(slowMoMs({ QA_SLOWMO: '800' })).toBe(800);
  for (const bad of ['', ' ', '-1', '1.5', 'slow', '800ms'])
    expect(() => slowMoMs({ QA_SLOWMO: bad }), bad).toThrow(/QA_SLOWMO must be a whole number/);
});

test('the test timeout grows with the slow motion, and stays as it is without it', () => {
  expect(testTimeoutMs(30_000, 0)).toBe(30_000);
  expect(testTimeoutMs(30_000, 800)).toBe(30_000 + 800 * SLOWED_ACTIONS);
});
