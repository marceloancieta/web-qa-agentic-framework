// Page health guard: what goes wrong on a page without failing the step that caused it. It watches
// a page for the whole test and reports, at the end:
//   console-error    a console message of type error
//   uncaught-error   an exception no page script caught
//   failed-request   a same-origin request that failed at the network level, or answered 5xx
//   broken-image     an <img> that finished loading without an image
// The core fixtures attach a guard to every page they open; a test opts out with a reason.

import type { Page } from '@playwright/test';

export type HealthProblemKind =
  'console-error' | 'uncaught-error' | 'failed-request' | 'broken-image';

export interface HealthProblem {
  kind: HealthProblemKind;
  detail: string;
}

export interface PageHealthOptions {
  /** A reason to switch the guard off for this test; an empty reason is refused. */
  off?: string;
  /** Console errors that are expected (text or pattern), such as a known third-party warning. */
  allowConsole?: readonly (string | RegExp)[];
  /** Same-origin URLs whose failure is expected, such as a probe of a missing route. */
  allowRequests?: readonly (string | RegExp)[];
}

const matches = (text: string, allowed: readonly (string | RegExp)[] = []) =>
  allowed.some((entry) => (typeof entry === 'string' ? text.includes(entry) : entry.test(text)));

function sameOrigin(url: string, pageUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(pageUrl).origin;
  } catch {
    return false;
  }
}

export interface PageHealthGuard {
  /** Every problem seen so far, plus broken images on the page as it is now. */
  problems(): Promise<HealthProblem[]>;
}

/** Start watching a page. Call before navigating, so early problems are not missed. */
export function watchPageHealth(page: Page, options: PageHealthOptions = {}): PageHealthGuard {
  const seen: HealthProblem[] = [];
  page.on('console', (message) => {
    // The browser's own "Failed to load resource" lines repeat what the request checks below
    // already judge (and would flag third-party hosts a mock blocked on purpose).
    if (message.text().startsWith('Failed to load resource')) return;
    if (message.type() === 'error' && !matches(message.text(), options.allowConsole)) {
      seen.push({ kind: 'console-error', detail: message.text() });
    }
  });
  page.on('pageerror', (error) => {
    seen.push({ kind: 'uncaught-error', detail: error.message });
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!sameOrigin(url, page.url()) || matches(url, options.allowRequests)) return;
    seen.push({
      kind: 'failed-request',
      detail: `${request.method()} ${url}: ${request.failure()?.errorText}`,
    });
  });
  page.on('response', (response) => {
    const url = response.url();
    if (
      response.status() < 500 ||
      !sameOrigin(url, page.url()) ||
      matches(url, options.allowRequests)
    )
      return;
    seen.push({
      kind: 'failed-request',
      detail: `${response.request().method()} ${url}: ${response.status()}`,
    });
  });

  return {
    async problems() {
      if (page.isClosed()) return [...seen];
      const broken = await page
        .evaluate(() =>
          Array.from(document.images)
            .filter(
              (image) => image.complete && image.naturalWidth === 0 && image.getAttribute('src'),
            )
            .map((image) => image.currentSrc || image.src),
        )
        .catch(() => [] as string[]);
      const images = broken
        .filter((src) => !matches(src, options.allowRequests))
        .map((src): HealthProblem => ({ kind: 'broken-image', detail: src }));
      return [...seen, ...images];
    },
  };
}

/** The failure message for a list of problems, or null when there are none. */
export function healthReport(problems: readonly HealthProblem[]): string | null {
  if (problems.length === 0) return null;
  const lines = problems.map((problem) => `  ${problem.kind}: ${problem.detail}`);
  return (
    `The page health guard found ${problems.length} problem(s):\n${lines.join('\n')}\n` +
    'Fix the page, allow an expected one (allowConsole, allowRequests), or switch the guard off ' +
    "for this test with a reason: test.use({ pageHealth: { off: '<why>' } })."
  );
}

/** Refuse an opt-out without a reason. */
export function checkOptions(options: PageHealthOptions): void {
  if (options.off !== undefined && !options.off.trim()) {
    throw new Error('pageHealth.off needs a reason: say why this test cannot keep the guard on.');
  }
}
