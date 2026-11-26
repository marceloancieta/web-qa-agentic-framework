import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  animationsSettled,
  compareWithBaseline,
  loadBaseline,
  routeOf,
  scan,
  selectorsFor,
  violationReport,
  type FoundViolation,
  type KnownViolation,
} from '../accessibility';

const found = (rule: string, target: string, route = '/#/login'): FoundViolation => ({
  rule,
  target,
  route,
  impact: 'serious',
  help: `${rule} help`,
});
const known = (
  rule: string,
  target: string,
  expires = '2099-01-01',
  route = '/#/login',
): KnownViolation => ({
  rule,
  target,
  route,
  key: 'LOCAL-7',
  expires,
});

test('new, known, expired and gone violations against the baseline', () => {
  const comparison = compareWithBaseline(
    [found('color-contrast', '#submit'), found('image-alt', 'img.logo'), found('label', '#email')],
    [
      known('color-contrast', '#submit'),
      known('image-alt', 'img.logo', '2026-01-01'),
      known('button-name', '#close'),
      known('button-name', '#menu', '2099-01-01', '/#/search'),
    ],
    '/#/login',
    '2026-10-24',
  );
  expect(comparison.known.map((v) => v.rule)).toEqual(['color-contrast']);
  expect(comparison.new.map((v) => v.rule)).toEqual(['image-alt', 'label']);
  expect(comparison.new[0]?.expired?.key).toBe('LOCAL-7');
  expect(comparison.gone.map((v) => v.target)).toEqual(['#close']);
  const report = violationReport(comparison, 'apps/shop/a11y-known.json');
  expect(report).toContain('2 new accessibility violation(s) on /#/login');
  expect(report).toContain('(baseline entry LOCAL-7 expired 2026-01-01)');
  expect(violationReport({ new: [], known: [], gone: [] }, 'x')).toBeNull();
});

test('the same element on another route is a different violation', () => {
  const comparison = compareWithBaseline(
    [found('label', '#q', '/#/search')],
    [known('label', '#q')],
    '/#/search',
  );
  expect(comparison.new).toHaveLength(1);
});

test('an entry covers the elements its selector matches, and `*` every route without going', () => {
  const box = { ...found('label', '.ng-valid', '/#/search'), matches: ['app-search input'] };
  const image = (n: number) => ({
    ...found('image-alt', `img:nth-child(${n})`),
    matches: ['.g-image'],
  });
  const comparison = compareWithBaseline(
    [box, image(1), image(2), found('label', '#other')],
    [
      known('label', 'app-search input', '2099-01-01', '*'),
      known('image-alt', '.g-image'),
      known('label', 'app-search input', '2026-01-01', '/#/search'),
    ],
    '/#/login',
    '2026-10-24',
  );
  expect(comparison.known.map((v) => v.target)).toEqual([
    '.ng-valid',
    'img:nth-child(1)',
    'img:nth-child(2)',
  ]);
  expect(comparison.known[0]?.entry.route).toBe('*');
  expect(comparison.new.map((v) => v.target)).toEqual(['#other']);
  expect(comparison.gone).toEqual([]);
  expect(
    selectorsFor(
      [known('a', 'x', '2099-01-01', '*'), known('b', 'y'), known('c', 'x')],
      '/#/login',
    ),
  ).toEqual(['x', 'y']);
});

test('the baseline file: missing is empty, every entry needs every field and a date', () => {
  const dir = mkdtempSync(join(tmpdir(), 'a11y-'));
  expect(loadBaseline(join(dir, 'missing.json'))).toEqual([]);
  const file = join(dir, 'a11y-known.json');
  writeFileSync(
    file,
    JSON.stringify([{ rule: 'label', target: '#q', route: '/', key: '', expires: 'soon' }]),
  );
  expect(() => loadBaseline(file)).toThrow(/entry 0 has no key; entry 0 expires is not YYYY-MM-DD/);
  expect(routeOf('http://shop.test/a/b?x=1#/login')).toBe('/a/b?x=1#/login');
  expect(routeOf('about:blank')).toBe('about:blank');
});

test('a scan finds seeded violations and include narrows it', async ({ page }) => {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Seeded</title></head><body><main>
    <h1>Seeded</h1><section id="good"><button>Save</button></section>
    <section id="bad"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" class="logo"><button class="icon"></button></section>
    </main></body></html>`);
  const all = await scan(page, { tags: ['wcag2a', 'wcag2aa'] });
  const rules = all.violations.map((v) => `${v.rule} ${v.target}`).sort();
  expect(rules).toEqual(['button-name .icon', 'image-alt img']);
  const good = await scan(page, { tags: ['wcag2a'], include: ['#good'] });
  expect(good.violations).toEqual([]);
});

// Dark text on a light panel that fades in, like a notification after a save: its final colours pass
// the contrast rule, the colours of a frame in the middle of the fade do not.
const FADING = `<!doctype html><html lang="en"><head><title>Fading</title><style>
  @keyframes appear { from { opacity: 0 } to { opacity: 1 } }
  #note { background: #e3e2e6; color: #2f3033; animation: appear 1.5s linear; }
  #spinner { width: 8px; height: 8px; animation: appear 1s linear infinite; }
  </style></head><body><main><h1>Fading</h1><div id="spinner"></div>
  <div id="note">Setup successfully completed.</div></main></body></html>`;

test('a scan in the middle of a fade reads blended colours; scan waits for the fade to end', async ({
  page,
}) => {
  // A fade long enough that axe, however slow to start, reads a frame in the middle of it.
  await page.setContent(FADING.replace('appear 1.5s linear;', 'appear 20s linear;'));
  const midFade = await new AxeBuilder({ page })
    .include('#note')
    .withRules(['color-contrast'])
    .analyze();
  expect(midFade.violations.map((v) => v.id)).toEqual(['color-contrast']);

  await page.setContent(FADING);
  const { violations } = await scan(page, { tags: ['wcag2aa'], include: ['#note'] });
  expect(violations).toEqual([]);
});

test('an endless animation is not waited for, and a fade that outlasts the wait is scanned as it is', async ({
  page,
}) => {
  await page.setContent(FADING.replace('appear 1.5s linear;', 'none;'));
  const started = Date.now();
  expect(await animationsSettled(page)).toBe(true);
  expect(Date.now() - started).toBeLessThan(1_000);

  await page.setContent(FADING);
  expect(await animationsSettled(page, 200)).toBe(false);
});

test('a scan says which baseline selectors each element matches, and refuses an invalid one', async ({
  page,
}) => {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Seeded</title></head><body><main>
    <h1>Seeded</h1><section id="bad"><button class="icon"></button></section></main></body></html>`);
  const { violations } = await scan(page, { tags: ['wcag2a'] }, ['#bad button', 'a', 'main .icon']);
  expect(violations.map((v) => v.matches)).toEqual([['#bad button', 'main .icon']]);
  const invalid = scan(page, { tags: ['wcag2a'] }, ['button[']);
  await expect(invalid).rejects.toThrow('invalid selectors: button[');
});
