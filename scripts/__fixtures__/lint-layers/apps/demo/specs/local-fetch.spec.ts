import { expect, test } from '../fixtures';

// A file that declares its own fetch is not calling the global one.
const fetch = async (id: string) => id;

test('a local function named fetch', async () => {
  expect(await fetch('order-1')).toBe('order-1');
});
