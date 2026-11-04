// The web vitals measurement, proved both ways on seeded pages: a healthy page keeps the budget, and
// a page that shifts its layout, paints its main content late or blocks on a click breaks it. The
// budgets are far from what each page produces, so a loaded machine does not change the outcome:
// the healthy page needs well under a second for each metric, the broken ones cross by design.

import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  budgetFindings,
  budgetFor,
  cumulativeLayoutShift,
  interactionToNextPaint,
  measureVisits,
  median,
  medians,
  vitalsReport,
  type VitalsBudget,
  type VitalsSample,
} from '../web-vitals';

const ORIGIN = 'http://vitals.test';

const page = (body: string, script = '') =>
  `<!doctype html><html lang="en"><head><title>Vitals</title><style>
  body { margin: 0; font: 16px/1.5 sans-serif; } .block { height: 600px; background: #eee; }
</style></head><body>${body}<script>${script}</script></body></html>`;

const MENU = `<button id="menu">Menu</button><nav hidden>Items</nav>`;
const OPEN_MENU = `document.getElementById('menu').addEventListener('click', () => {
  document.querySelector('nav').hidden = false; });`;

const PAGES: Record<string, string> = {
  // Its content is there on the first paint and the menu opens at once.
  '/healthy': page(
    `<main><h1>Healthy</h1>${MENU}<div class="block">Content</div></main>`,
    OPEN_MENU,
  ),
  // A banner arrives after the first paint and pushes the whole page down.
  '/shifting': page(
    `<main><h1>Shifting</h1>${MENU}<div class="block">Content</div></main>`,
    `${OPEN_MENU} setTimeout(() => { const banner = document.createElement('div');
     banner.id = 'banner'; banner.style.height = '400px'; banner.textContent = 'Late banner';
     document.body.prepend(banner); }, 300);`,
  ),
  // Nothing contentful until the main content arrives, 1.5 s after load.
  '/late': page(
    MENU,
    `${OPEN_MENU} setTimeout(() => { const main = document.createElement('main');
     main.innerHTML = '<h1>Late</h1><div class="block">Content that came late</div>';
     document.body.append(main); }, 1500);`,
  ),
  // The click handler keeps the main thread busy for 400 ms before the menu opens.
  '/blocking': page(
    `<main><h1>Blocking</h1>${MENU}<div class="block">Content</div></main>`,
    `document.getElementById('menu').addEventListener('click', () => {
       const until = performance.now() + 400; while (performance.now() < until) {}
       document.querySelector('nav').hidden = false; });`,
  ),
};

const BUDGET: VitalsBudget = { lcp_ms: 1000, cls: 0.1, inp_ms: 200 };

/** A new context per visit, its pages served from PAGES. */
function opener(browser: Browser, init?: () => void) {
  return async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.route(`${ORIGIN}/**`, (route) => {
      const body = PAGES[new URL(route.request().url()).pathname];
      return body
        ? route.fulfill({ status: 200, contentType: 'text/html', body })
        : route.fulfill({ status: 404, body: 'not found' });
    });
    if (init) await context.addInitScript(init);
    return { context, page: await context.newPage() };
  };
}

/** Load a seeded page, wait for its main content, then open the menu: a read-only interaction. */
const visitAndOpenMenu = (path: string, ready: string) => async (visited: Page) => {
  await visited.goto(`${ORIGIN}${path}`);
  await expect(visited.getByText(ready)).toBeVisible();
  await visited.getByRole('button', { name: 'Menu' }).click();
  await expect(visited.getByRole('navigation')).toBeVisible();
};

async function measure(browser: Browser, path: string, ready: string, samples = 3) {
  const outcome = await measureVisits(opener(browser), visitAndOpenMenu(path, ready), {
    samples,
    interaction: true,
  });
  if ('missing' in outcome) throw new Error(`Chromium lacks ${outcome.missing.join(', ')}`);
  return outcome.samples;
}

test.describe('web vitals on seeded pages', () => {
  test('a healthy page keeps the budget, with every metric measured on every visit', async ({
    browser,
  }) => {
    const samples = await measure(browser, '/healthy', 'Content');
    expect(samples).toHaveLength(3);
    for (const sample of samples) {
      expect(sample.lcpMs).not.toBeNull();
      expect(sample.interactions).toBeGreaterThan(0);
      expect(sample.inpMs).not.toBeNull();
    }
    expect(budgetFindings(samples, BUDGET)).toEqual([]);
    expect(vitalsReport('/healthy', samples, BUDGET)).toBeNull();
  });

  test('a late banner that pushes the page down breaks the CLS budget', async ({ browser }) => {
    const samples = await measure(browser, '/shifting', 'Late banner');
    expect(medians(samples).cls).toBeGreaterThan(0.25);
    const findings = budgetFindings(samples, BUDGET);
    expect(findings).toEqual([expect.stringMatching(/^CLS: median [\d.]+ over budget 0\.1$/)]);
    expect(vitalsReport('/shifting', samples, BUDGET)).toMatch(
      /\/shifting breaks its web vitals budget over 3 visit\(s\):\n {2}CLS: .*\n {2}visit 1: LCP/,
    );
  });

  test('main content painted late breaks the LCP budget', async ({ browser }) => {
    const samples = await measure(browser, '/late', 'Content that came late');
    expect(medians(samples).lcpMs).toBeGreaterThanOrEqual(1500);
    expect(budgetFindings(samples, BUDGET)).toEqual([
      expect.stringMatching(/^LCP: median \d+ ms over budget 1000 ms$/),
    ]);
  });

  test('a click that blocks the main thread breaks the INP budget', async ({ browser }) => {
    const samples = await measure(browser, '/blocking', 'Content', 1);
    expect(samples[0]?.inpMs).toBeGreaterThanOrEqual(400);
    expect(budgetFindings(samples, BUDGET)).toEqual([
      expect.stringMatching(/^INP: median \d+ ms over budget 200 ms$/),
    ]);
  });

  test('a visit that never interacts fails instead of passing INP on nothing', async ({
    browser,
  }) => {
    const loadOnly = async (visited: Page) => {
      await visited.goto(`${ORIGIN}/healthy`);
      await expect(visited.getByText('Content')).toBeVisible();
    };
    await expect(
      measureVisits(opener(browser), loadOnly, { samples: 1, interaction: true }),
    ).rejects.toThrow(/Visit 1 recorded no interaction/);
  });

  test('an engine without an entry type is reported as missing, and nothing is visited', async ({
    browser,
  }) => {
    let visits = 0;
    const onlyLcp = () =>
      Object.defineProperty(PerformanceObserver, 'supportedEntryTypes', {
        get: () => ['largest-contentful-paint'],
      });
    const outcome = await measureVisits(
      opener(browser, onlyLcp),
      async () => {
        visits += 1;
      },
      { samples: 3, interaction: true },
    );
    expect(outcome).toEqual({ missing: ['layout-shift', 'event', 'first-input'] });
    expect(visits).toBe(0);
  });
});

test('CLS is the largest session window: a gap over 1 s or a window over 5 s starts another', () => {
  expect(cumulativeLayoutShift([])).toBe(0);
  const shift = (startTime: number, value = 0.1) => ({ startTime, value });
  // One window: each shift within 1 s of the one before.
  expect(cumulativeLayoutShift([shift(0), shift(900), shift(1800)])).toBeCloseTo(0.3);
  // A gap of 1.1 s splits them; the larger window counts.
  expect(cumulativeLayoutShift([shift(0), shift(500), shift(1600, 0.05)])).toBeCloseTo(0.2);
  // Shifts every 900 ms: the window closes once it is over 5 s long.
  const steady = Array.from({ length: 8 }, (_, i) => shift(i * 900));
  expect(cumulativeLayoutShift(steady)).toBeCloseTo(0.6);
  // The order of the entries does not matter.
  expect(cumulativeLayoutShift([shift(1800), shift(0), shift(900)])).toBeCloseTo(0.3);
});

test('INP is the slowest interaction, leaving out one in every 50', () => {
  expect(interactionToNextPaint([])).toBeNull();
  expect(interactionToNextPaint([24, 120, 40])).toBe(120);
  const many = [...Array.from({ length: 49 }, () => 40), 900];
  expect(interactionToNextPaint(many)).toBe(40);
  expect(interactionToNextPaint(many.slice(1))).toBe(900);
});

test('the median takes the middle value, or the mean of the middle two', () => {
  expect(median([300, 100, 200])).toBe(200);
  expect(median([400, 100, 300, 200])).toBe(250);
  expect(() => median([])).toThrow(/no values/);
});

test("a device's budget is the default with what the device sets over it", () => {
  const config = {
    budgets: {
      default: { lcp_ms: 2500, cls: 0.1, inp_ms: 200 },
      'mobile-chrome': { lcp_ms: 4000 },
    },
  };
  expect(budgetFor(config, 'mobile-chrome')).toEqual({ lcp_ms: 4000, cls: 0.1, inp_ms: 200 });
  expect(budgetFor(config, 'desktop-chromium')).toEqual({ lcp_ms: 2500, cls: 0.1, inp_ms: 200 });
  expect(budgetFor({ budgets: { 'mobile-chrome': { cls: 0.2 } } }, 'desktop-chromium')).toBeNull();
  expect(budgetFor(undefined, 'desktop-chromium')).toBeNull();
});

test('a budgeted metric that a visit did not measure is a finding, an unbudgeted one is not judged', () => {
  const sample = (lcpMs: number | null, inpMs: number | null): VitalsSample => ({
    lcpMs,
    cls: 0,
    inpMs,
    interactions: inpMs === null ? 0 : 1,
  });
  const samples = [sample(800, 40), sample(null, 40), sample(900, 40)];
  expect(budgetFindings(samples, { lcp_ms: 2500 })).toEqual([
    'LCP: not measured on every visit (budget 2500 ms)',
  ]);
  expect(budgetFindings(samples, { inp_ms: 200, cls: 0.1 })).toEqual([]);
  // The median, not the worst visit: one slow visit of three does not break the budget.
  expect(budgetFindings([sample(800, 40), sample(9000, 40), sample(900, 40)], BUDGET)).toEqual([]);
});
