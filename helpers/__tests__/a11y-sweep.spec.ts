import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openForSweep, readyMarks, sweepPlan, type SweepTarget } from '../a11y-sweep';
import { expect, test } from './fake-app';

const SHELL = ['button "Open Sidenav"', 'button "Show/hide account menu"', 'textbox ""'];

/** A repository root holding one pack whose docs folder has these files. */
function packWith(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'a11y-sweep-'));
  const docs = join(root, 'apps', 'shop', 'docs');
  mkdirSync(docs, { recursive: true });
  for (const [name, value] of Object.entries(files)) {
    writeFileSync(join(docs, name), typeof value === 'string' ? value : JSON.stringify(value));
  }
  return root;
}

const route = (path: string, extra: Record<string, string[]> = {}) => ({
  route: path,
  landmarks: [],
  headings: [],
  interactive: SHELL,
  ...extra,
});

test('anonymous routes from app-map.json, each role from its own map', () => {
  const root = packWith({
    'app-map.json': { routes: [route('/#/'), route('/#/login')] },
    'app-map.customer.json': { routes: [route('/#/'), route('/#/basket')] },
    'app-map.admin.json': { routes: [route('/#/admin')] },
    'app-notes.md': '# notes',
  });
  const { targets, problems } = sweepPlan('shop', root);
  expect(problems).toEqual([]);
  expect(targets.map((t) => `${t.role} ${t.route}`)).toEqual([
    'anonymous /#/',
    'anonymous /#/login',
    'admin /#/admin',
    'customer /#/',
    'customer /#/basket',
  ]);
});

test('a missing or broken map is a problem, never an exception', () => {
  expect(sweepPlan('shop', packWith({})).problems).toEqual([
    expect.stringMatching(/app-map\.json.*npm run app:map -- --pack shop --write$/),
  ]);
  const root = packWith({
    'app-map.json': { routes: [route('/#/')] },
    'app-map.customer.json': '{ not json',
    'app-map.admin.json': { routes: [] },
    'app-map.editor.json': { routes: [{ route: 'basket' }] },
  });
  const { targets, problems } = sweepPlan('shop', root);
  expect(targets.map((t) => t.route)).toEqual(['/#/']);
  expect(problems).toEqual([
    expect.stringMatching(/app-map\.admin\.json lists no routes$/),
    expect.stringMatching(/cannot read .*app-map\.customer\.json/),
    expect.stringMatching(/app-map\.editor\.json has a route that is not a path: "basket"$/),
  ]);
});

test('a route is ready on its headings, named landmarks and own controls', () => {
  const shared = new Set(SHELL);
  const marks = readyMarks(
    {
      route: '/#/about',
      landmarks: ['main', 'region "Customer Feedback"'],
      headings: ['h1 About Us', 'h1 Your Basket (<EMAIL>)'],
      interactive: [...SHELL, 'button "Add to Basket" x15', 'link "Say \\"hi\\""', 'slider ""'],
    },
    shared,
  );
  expect(marks).toEqual({
    ready: [
      { role: 'heading', name: 'About Us', level: 1 },
      { role: 'region', name: 'Customer Feedback' },
      { role: 'button', name: 'Add to Basket' },
      { role: 'link', name: 'Say "hi"' },
      { role: 'slider' },
    ],
    readyOn: 'every',
  });
});

test('without its own marks a route waits for its landmarks, then for any shared control', () => {
  const shared = new Set(SHELL);
  expect(readyMarks({ route: '/#/', landmarks: ['main'], interactive: SHELL }, shared)).toEqual({
    ready: [{ role: 'main' }],
    readyOn: 'every',
  });
  expect(readyMarks({ route: '/#/orders', interactive: SHELL }, shared)).toEqual({
    ready: [
      { role: 'button', name: 'Open Sidenav' },
      { role: 'button', name: 'Show/hide account menu' },
    ],
    readyOn: 'any',
  });
});

test('opening a target waits for its marks and fails when one never shows', async ({
  browser,
  fakeApp,
}) => {
  const context = await browser.newContext({ baseURL: `${fakeApp.url}/` });
  const page = await context.newPage();
  const ready: SweepTarget = {
    role: 'anonymous',
    route: '/products',
    ready: [{ role: 'heading', name: 'Products', level: 1 }, { role: 'main' }],
    readyOn: 'every',
  };
  await openForSweep(page, ready);
  expect(new URL(page.url()).pathname).toBe('/products');
  const either: SweepTarget = {
    ...ready,
    ready: [{ role: 'heading', name: 'Checkout' }, { role: 'main' }],
    readyOn: 'any',
  };
  await openForSweep(page, either);
  await expect(openForSweep(page, { ...either, readyOn: 'every' })).rejects.toThrow(/toBeVisible/);
  await context.close();
});

test('opening a target waits until the page stops changing, and fails when it never does', async ({
  browser,
}) => {
  const context = await browser.newContext({ baseURL: 'http://sweep.test/' });
  // A heading at once, a question 600 ms later; or a counter that never stops.
  await context.route('http://sweep.test/**', (route) => {
    const late = route.request().url().endsWith('/late');
    const script = late
      ? "setTimeout(() => { document.querySelector('p').textContent = 'What is 3+4?'; }, 600);"
      : "let n = 0; setInterval(() => { document.querySelector('p').textContent = 'tick ' + n++; }, 50);";
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="en"><title>t</title><main><h1>Feedback</h1><p></p></main><script>${script}</script></html>`,
    });
  });
  const page = await context.newPage();
  const target = (route: string): SweepTarget => ({
    role: 'anonymous',
    route,
    ready: [{ role: 'heading', name: 'Feedback', level: 1 }],
    readyOn: 'every',
  });
  await openForSweep(page, target('/late'));
  // Read once on purpose: the question must already be there when openForSweep returns.
  expect(await page.locator('p').textContent()).toBe('What is 3+4?');
  await expect(openForSweep(page, target('/ticking'))).rejects.toThrow(/stops changing/);
  await context.close();
});
