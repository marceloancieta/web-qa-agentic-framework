import { test } from '@playwright/test';
import { knownGap } from '../../../helpers/case-meta';

const gapKey = 'BUG-2';

test('TC-BASKET-01 the total adds every product', async () => {
  test.fail(true, await knownGap('BUG-1', 'the total ignores the second product'));
});

test('TC-BASKET-02 the empty basket says it is empty', async () => {
  test.fail(true, await knownGap('BUG-2', 'the empty basket has no message')); // expect-finding: closed-key
});

test('TC-BASKET-04 a removed product leaves the total', async () => {
  test.fail(
    true,
    await knownGap(
      'BUG-9', // expect-finding: unknown-key
      'a removed product stays in the total',
    ),
  );
});

test('TC-BASKET-06 a template literal with no substitution is a literal', async () => {
  test.fail(true, await knownGap(`BUG-2`, 'the empty basket has no message')); // expect-finding: closed-key
});

test('TC-BASKET-07 a key that does not match the pattern never reaches the tracker', async () => {
  test.fail(true, await knownGap('BUG-three', 'a mistyped key')); // expect-finding: unknown-key
});

test('TC-BASKET-08 a key from an expression', async () => {
  test.fail(true, await knownGap(gapKey, 'the key is in a constant')); // expect-finding: dynamic-key
});

test('TC-BASKET-09 a key built in the call', async () => {
  test.fail(true, await knownGap(`BUG-${2}`, 'the key is built')); // expect-finding: dynamic-key
});

test('TC-BASKET-10 what looks like a citation and is not one', async ({ page }) => {
  // knownGap('BUG-2', 'a closed key in a line comment')
  /* knownGap('BUG-9', 'an unknown key in a block comment') */
  const quoted = "knownGap('BUG-2', 'a call inside a string')";
  const template = `knownGap('BUG-9', 'a call inside a template')`;
  test.fail(true, 'BUG-2: a reason that does not go through knownGap');
  await page.knownGap('BUG-2', 'a method of another object');
  await knownGapOf('BUG-9', 'another function');
  await page.getByText(`${quoted} ${template}`).click();
});
