import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  compareWithBaseline,
  loadBaseline,
  routeOf,
  scan,
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
