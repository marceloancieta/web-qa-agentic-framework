import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { appPacks } from '../app-pack';
import { REPO_ROOT } from '../config';
import { loadDesignTokens, parseDesignTokens, tokenMismatches } from '../design-tokens';

const DOCUMENT = {
  $description: 'A small design system for the checks.',
  color: {
    $type: 'color',
    ink: { $value: 'oklch(0.147 0.004 49.25)' },
    paper: { $value: '#ffffff' },
    action: { $value: '{color.ink}', $description: 'Primary buttons.' },
  },
  font: {
    body: { $type: 'fontFamily', $value: ['Geist Variable', 'ui-sans-serif', 'sans-serif'] },
    size: { $type: 'dimension', small: { $value: { value: 0.8125, unit: 'rem' } } },
    strong: { $type: 'fontWeight', $value: 700 },
  },
  radius: { control: { $type: 'dimension', $value: '10px' } },
  speed: { quick: { $type: 'duration', $value: { value: 100, unit: 'ms' } } },
};

const BUTTON = `<!doctype html><html><head><style>
  html { font-size: 16px; }
  button { background-color: oklch(14.7% .004 49.25); color: rgb(255 255 255);
    font-family: "Geist Variable", ui-sans-serif, sans-serif; font-size: 13px; font-weight: bold;
    border-radius: 10px; transition: background-color 0.1s linear; }
  button.off { background-color: rgb(200, 30, 30); border-radius: 4px; font-size: 14px; }
  button.late { transition: background-color 300ms linear; }
  button.late.hot { background-color: rgb(200, 30, 30); }
</style></head><body><main><button id="ok">Save</button><button id="off" class="off">Save</button>
<button id="late" class="late">Save</button></main></body></html>`;

const EXPECTED = {
  'background-color': 'color.action',
  color: 'color.paper',
  'font-family': 'font.body',
  'font-size': 'font.size.small',
  'font-weight': 'font.strong',
  'border-radius': 'radius.control',
} as const;

test('tokens resolve groups, inherited types, { value, unit } and aliases into CSS text', () => {
  const tokens = parseDesignTokens(DOCUMENT);
  expect([...tokens.values()]).toEqual(
    expect.arrayContaining([
      { name: 'color.ink', type: 'color', css: 'oklch(0.147 0.004 49.25)' },
      { name: 'color.action', type: 'color', css: 'oklch(0.147 0.004 49.25)' },
      {
        name: 'font.body',
        type: 'fontFamily',
        css: '"Geist Variable", ui-sans-serif, sans-serif',
      },
      { name: 'font.size.small', type: 'dimension', css: '0.8125rem' },
      { name: 'font.strong', type: 'fontWeight', css: '700' },
      { name: 'speed.quick', type: 'duration', css: '100ms' },
    ]),
  );
  expect(tokens.size).toBe(8);
});

test('a family name is quoted with its quotes and backslashes escaped', () => {
  const tokens = parseDesignTokens({
    font: { odd: { $type: 'fontFamily', $value: ['Say "Hi"', 'Back\\slash', 'serif'] } },
  });
  expect(tokens.get('font.odd')?.css).toBe('"Say \\"Hi\\"", "Back\\\\slash", serif');
});

test('a broken document is refused with every problem, by token', () => {
  const broken = {
    color: {
      $type: 'color',
      a: { $value: '{color.b}' },
      b: { $value: '{color.a}' },
      gone: { $value: '{color.nowhere}' },
      empty: { $value: '' },
    },
    size: { $type: 'dimension', odd: { $value: { value: '4', unit: 'px' } } },
    untyped: { $value: '4px' },
    weird: { $type: 'shadow', $value: '0 0 1px red' },
    mixed: { $type: 'dimension', $value: '{color.empty}' },
    'dot.ted': { $type: 'number', $value: 1 },
  };
  let message = '';
  try {
    parseDesignTokens(broken, 'apps/shop/design-tokens.json');
  } catch (error) {
    message = (error as Error).message;
  }
  expect(message).toMatch(/^apps\/shop\/design-tokens\.json: /);
  for (const part of [
    /"color\.a" refers to itself through color\.a -> color\.b -> color\.a/,
    /"color\.gone" refers to "color\.nowhere", which is not a token/,
    /"color\.empty" must have as \$value a color value/,
    /"size\.odd" must have as \$value a \{ value, unit \}/,
    /"untyped" has no \$type/,
    /"weird" has \$type "shadow"/,
    /"dot\.ted" has a name with a dot/,
  ]) {
    expect(message).toMatch(part);
  }
  expect(() => parseDesignTokens({ $description: 'nothing' })).toThrow(/declares no token/);
  expect(() => parseDesignTokens([])).toThrow(/not a JSON object/);
});

test('a pack file is read from disk, and a missing one is named', () => {
  const dir = mkdtempSync(join(tmpdir(), 'design-tokens-'));
  const file = join(dir, 'design-tokens.json');
  writeFileSync(file, JSON.stringify(DOCUMENT));
  expect(loadDesignTokens(file).get('radius.control')?.css).toBe('10px');
  expect(() => loadDesignTokens(join(dir, 'none.json'))).toThrow(/has no design-tokens file/);
});

test("every pack's design-tokens.json in this checkout is valid", () => {
  for (const pack of appPacks(REPO_ROOT)) {
    const file = join(REPO_ROOT, 'apps', pack, 'design-tokens.json');
    if (existsSync(file)) expect(loadDesignTokens(file).size, file).toBeGreaterThan(0);
  }
});

test('a component drawn with its tokens matches, whatever notation the page used', async ({
  page,
}) => {
  const tokens = parseDesignTokens(DOCUMENT);
  await page.setContent(BUTTON);
  // The page writes the ink in percent oklch, the white as rgb, 0.8125rem as 13px and 700 as bold.
  expect(await tokenMismatches(page.locator('#ok'), EXPECTED, tokens)).toEqual([]);
});

test('a component off its tokens is reported property by property, with both values', async ({
  page,
}) => {
  const tokens = parseDesignTokens(DOCUMENT);
  await page.setContent(BUTTON);
  const mismatches = await tokenMismatches(page.locator('#off'), EXPECTED, tokens);
  expect(mismatches.map(({ property, token }) => [property, token])).toEqual([
    ['background-color', 'color.action'],
    ['font-size', 'font.size.small'],
    ['border-radius', 'radius.control'],
  ]);
  expect(mismatches[0]).toMatchObject({
    expected: 'oklch(0.147 0.004 49.25)',
    actual: 'rgb(200, 30, 30)',
  });
  expect(mismatches[2]).toMatchObject({ expected: '10px', actual: '4px' });
});

test('a font family matches with or without its quotes, and another family does not', async ({
  page,
}) => {
  const tokens = parseDesignTokens(DOCUMENT);
  // Unquoted, as Firefox gives the family a stylesheet set through a custom property.
  await page.setContent(`<p id="bare" style="font-family: Geist Variable, ui-sans-serif, sans-serif">a</p>
    <p id="other" style="font-family: 'Geist Mono', ui-sans-serif, sans-serif">b</p>`);
  expect(
    await tokenMismatches(page.locator('#bare'), { 'font-family': 'font.body' }, tokens),
  ).toEqual([]);
  const other = await tokenMismatches(
    page.locator('#other'),
    { 'font-family': 'font.body' },
    tokens,
  );
  expect(other.map(({ property }) => property)).toEqual(['font-family']);
});

test('a colour that changes through a transition is read at its end', async ({ page }) => {
  const tokens = parseDesignTokens({
    hot: { $type: 'color', $value: 'rgb(200, 30, 30)' },
  });
  await page.setContent(BUTTON);
  const late = page.locator('#late');
  await late.evaluate((element) => element.classList.add('hot'));
  expect(await tokenMismatches(late, { 'background-color': 'hot' }, tokens)).toEqual([]);
});

test('a token the pack does not have is a mistake in the case, and throws', async ({ page }) => {
  const tokens = parseDesignTokens(DOCUMENT);
  await page.setContent(BUTTON);
  await expect(
    tokenMismatches(page.locator('#ok'), { color: 'color.nowhere' }, tokens),
  ).rejects.toThrow(/"color\.nowhere" \(for color\) is not a token of the pack/);
});
