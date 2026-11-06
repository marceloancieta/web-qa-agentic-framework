// Page health guard: what goes wrong on a page without failing the step that caused it. It watches
// a page for the whole test and reports, at the end:
//   console-error    a console message of type error, with the fields of any error object it logged
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

/**
 * Whether a request failed because the page itself cancelled it: a reload or a navigation while it
 * was in flight. Each engine names that differently (Chromium net::ERR_ABORTED, Firefox
 * NS_BINDING_ABORTED, WebKit "Load request cancelled"); none of them is a broken page. A request a
 * mock aborts with `failed` or `internetdisconnected` is still reported; one aborted with `aborted`
 * looks like a cancellation and is not, so no mock uses that code.
 */
export function cancelledByPage(errorText: string | undefined): boolean {
  return /^(net::ERR_ABORTED|NS_BINDING_ABORTED|Load request cancelled|cancelled)$/i.test(
    errorText ?? '',
  );
}

/**
 * The URLs a console error blames on a request that never got an answer: every error object it
 * describes (see describeErrorObjects) with `status: 0` and a `url`, resolved against the page's
 * address. Null when the message describes no error object, or any of them is not of that kind, so a
 * message is only ever excused as a whole.
 */
export function unansweredRequestUrls(text: string, pageUrl: string): string[] | null {
  const described = /\[([^[\]]*\{[^[\]]*\})\]$/s.exec(text)?.[1];
  if (!described) return null;
  const urls: string[] = [];
  for (const detail of described.split('; ')) {
    const status = /[{ ]status: (\d+)[,}]/.exec(detail)?.[1];
    const url = /[{ ]url: ([^,}]+)[,}]/.exec(detail)?.[1];
    if (status !== '0' || !url) return null;
    try {
      urls.push(new URL(url, pageUrl).href);
    } catch {
      return null;
    }
  }
  return urls;
}

/**
 * Runs in the page before its scripts: `console.error` keeps its arguments and adds, at the end, a
 * description of each object argument that carries an error's fields (`name {message, status,
 * statusText, url}`). A framework logs an error object (Angular: `ERROR` and the object), and a
 * console message's text names it by engine (WebKit the minified class, Firefox `JSHandle@object`),
 * so the report would not say what failed. The description is written when the error is logged,
 * because a reload or a navigation right after it leaves nothing to ask the page for later.
 */
export function describeErrorObjects(): void {
  const original = console.error.bind(console);
  const describe = (value: object): string | null => {
    const fields = value as Record<string, unknown>;
    const parts = ['message', 'status', 'statusText', 'url']
      .filter((key) => ['string', 'number'].includes(typeof fields[key]) && fields[key] !== '')
      .map((key) => `${key}: ${String(fields[key])}`);
    if (parts.length === 0) return null;
    const name =
      typeof fields.name === 'string' && fields.name ? fields.name : value.constructor?.name;
    return `${name || 'Object'} {${parts.join(', ')}}`;
  };
  console.error = (...args: unknown[]) => {
    const details = args
      .filter((arg): arg is object => typeof arg === 'object' && arg !== null)
      .map(describe)
      .filter((detail): detail is string => detail !== null);
    original(...args, ...(details.length ? [`[${details.join('; ')}]`] : []));
  };
}

/** Start watching a page. Call before navigating, so early problems are not missed. */
export function watchPageHealth(page: Page, options: PageHealthOptions = {}): PageHealthGuard {
  const seen: HealthProblem[] = [];
  // A request the page cancels is not a problem, and neither is the error a framework logs for it
  // (Angular in Firefox: an HttpErrorResponse with status 0 when a reload cuts its request). The
  // two events come in either order, so the console error is excused when problems are read.
  const cancelled = new Set<string>();
  const blamed = new Map<HealthProblem, string[]>();
  const excused = (problem: HealthProblem) =>
    blamed.get(problem)?.every((url) => cancelled.has(url)) ?? false;
  // Ordered before the caller's first navigation on the same connection; a page already closed has
  // nothing left to watch.
  void page.addInitScript(describeErrorObjects).catch(() => undefined);
  page.on('console', (message) => {
    // The browser's own "Failed to load resource" lines repeat what the request checks below
    // already judge (and would flag third-party hosts a mock blocked on purpose).
    if (message.text().startsWith('Failed to load resource')) return;
    if (message.type() === 'error' && !matches(message.text(), options.allowConsole)) {
      const problem: HealthProblem = { kind: 'console-error', detail: message.text() };
      const urls = unansweredRequestUrls(message.text(), page.url());
      if (urls) blamed.set(problem, urls);
      seen.push(problem);
    }
  });
  page.on('pageerror', (error) => {
    seen.push({ kind: 'uncaught-error', detail: error.message });
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!sameOrigin(url, page.url()) || matches(url, options.allowRequests)) return;
    if (cancelledByPage(request.failure()?.errorText)) {
      cancelled.add(url);
      return;
    }
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
      const kept = seen.filter((problem) => !excused(problem));
      if (page.isClosed()) return kept;
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
      return [...kept, ...images];
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

/** The annotation that carries the guard's report on a case armed with `knownGap`. */
export const HEALTH_ANNOTATION = 'page-health';

/** The parts of a finished test that decide what the guard's report does. */
export interface HealthVerdictInput {
  status?: string;
  expectedStatus: string;
  annotations: readonly { type: string }[];
}

/**
 * What the guard does with its report when a test ends: `fail` the test, `note` the report on it,
 * or `none`. A case armed with `knownGap` is only noted: failing it would count as the failure it
 * expects, so a gap that was fixed would keep reading as armed instead of as an unexpected pass. A
 * plain `test.fail` carries no issue and still fails, which is how the guard's own tests prove it.
 */
export function healthVerdict(
  report: string | null,
  test: HealthVerdictInput,
): 'fail' | 'note' | 'none' {
  if (!report) return 'none';
  const armed =
    test.expectedStatus === 'failed' && test.annotations.some((a) => a.type === 'issue');
  if (armed) return 'note';
  return test.status === 'passed' ? 'fail' : 'none';
}

/** Refuse an opt-out without a reason. */
export function checkOptions(options: PageHealthOptions): void {
  if (options.off !== undefined && !options.off.trim()) {
    throw new Error('pageHealth.off needs a reason: say why this test cannot keep the guard on.');
  }
}
