// Web vitals measured in the browser under test: Largest Contentful Paint (LCP), Cumulative Layout
// Shift (CLS) and Interaction to Next Paint (INP), read from the browser's own PerformanceObserver
// entries. No library: a recorder added before the page loads keeps the raw entries, and the
// arithmetic (session windows, the slowest interaction, medians) runs here, where unit tests reach
// it.
//
// - LCP is the start time of the last `largest-contentful-paint` entry. The browser stops reporting
//   candidates at the first input, and the largest element can paint after the controls a visit
//   waits for, so the interaction waits until a candidate was reported and none followed for
//   `LCP_SETTLE.quietMs` (`waitForLargestPaint`).
// - CLS is the largest session window of `layout-shift` entries without recent input: a window
//   closes after a gap of 1 s or at 5 s from its first shift.
// - INP is the slowest interaction of the visit (with 50 or more, one in every 50 is left out as an
//   outlier). Interactions come from `event` entries with an `interactionId` (over 16 ms, the
//   lowest threshold the API takes) and the `first-input` entry, which is reported whatever its
//   duration, so a fast click still counts as an interaction.
//
// An engine that lacks one of the entry types cannot give the three numbers; the caller skips with
// `missingEntryTypes` as the reason instead of passing a budget nothing measured.

import type { BrowserContext, Page } from '@playwright/test';

/** What the recorder observes; every one must be in `PerformanceObserver.supportedEntryTypes`. */
export const VITAL_ENTRY_TYPES = [
  'largest-contentful-paint',
  'layout-shift',
  'event',
  'first-input',
] as const;

/** The raw entries of one visit, as the recorder in the page keeps them. */
export interface RecordedVitals {
  lcpMs: number | null;
  /** How long ago, in ms, the last LCP candidate was reported; null before the first one. */
  lcpQuietMs: number | null;
  shifts: { startTime: number; value: number }[];
  /** The duration of each interaction, in ms, one per interaction id. */
  interactions: number[];
}

/** One visit's three numbers. */
export interface VitalsSample {
  lcpMs: number | null;
  cls: number;
  inpMs: number | null;
  interactions: number;
}

/** A budget: the highest median each metric may reach. A metric left out is not judged. */
export interface VitalsBudget {
  lcp_ms?: number;
  cls?: number;
  inp_ms?: number;
}

/** qa-config `app.environments.<env>.packs.<pack>.performance.web_vitals`. */
export interface WebVitalsConfig {
  /** Visits per measurement; the median of each metric is judged (5). */
  samples?: number;
  /** `default`, and a device project's name for what differs on that device. */
  budgets: Record<string, VitalsBudget>;
}

export const DEFAULT_SAMPLES = 5;

/**
 * The recorder, added to a context with `addInitScript` so it runs before the page's own scripts.
 * It is serialized into the page: everything it uses is defined inside it.
 */
export function recordVitals(): void {
  type Recorder = { read(): RecordedVitals };
  const scope = window as unknown as { __qaVitals?: Recorder };
  if (scope.__qaVitals || typeof PerformanceObserver === 'undefined') return;
  const supported = PerformanceObserver.supportedEntryTypes ?? [];
  let lcpMs: number | null = null;
  let lcpSeenAt: number | null = null;
  const shifts: { startTime: number; value: number }[] = [];
  const durations = new Map<number, number>();
  let firstInput: number | null = null;
  const observers: [PerformanceObserver, (entry: PerformanceEntry) => void][] = [];
  const observe = (
    type: string,
    onEntry: (entry: PerformanceEntry) => void,
    extra: Record<string, unknown> = {},
  ) => {
    if (!supported.includes(type)) return;
    const observer = new PerformanceObserver((list) => list.getEntries().forEach(onEntry));
    observer.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
    observers.push([observer, onEntry]);
  };
  const interaction = (entry: PerformanceEntry) => {
    const id = (entry as PerformanceEntry & { interactionId?: number }).interactionId ?? 0;
    if (id > 0) durations.set(id, Math.max(durations.get(id) ?? 0, entry.duration));
    return id;
  };
  observe('largest-contentful-paint', (entry) => {
    lcpMs = entry.startTime;
    lcpSeenAt = performance.now();
  });
  observe('layout-shift', (entry) => {
    const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
    if (!shift.hadRecentInput) shifts.push({ startTime: shift.startTime, value: shift.value });
  });
  observe('event', (entry) => void interaction(entry), { durationThreshold: 16 });
  observe('first-input', (entry) => {
    if (interaction(entry) === 0) firstInput = entry.duration;
  });
  scope.__qaVitals = {
    read() {
      for (const [observer, onEntry] of observers) observer.takeRecords().forEach(onEntry);
      const interactions = [...durations.values()];
      // A first input without an interaction id stands for an interaction of its own only when no
      // other entry recorded one.
      if (interactions.length === 0 && firstInput !== null) interactions.push(firstInput);
      const lcpQuietMs = lcpSeenAt === null ? null : performance.now() - lcpSeenAt;
      return { lcpMs, lcpQuietMs, shifts: [...shifts], interactions };
    },
  };
}

/** The entry types of `VITAL_ENTRY_TYPES` the page's engine does not support. */
export async function missingEntryTypes(page: Page): Promise<string[]> {
  const supported = await page.evaluate(() =>
    typeof PerformanceObserver === 'undefined' ? [] : [...PerformanceObserver.supportedEntryTypes],
  );
  return VITAL_ENTRY_TYPES.filter((type) => !supported.includes(type));
}

/**
 * The raw entries the recorder kept so far, after two animation frames: event timing entries are
 * reported after the paint that follows the event.
 */
export async function readRecorded(page: Page): Promise<RecordedVitals> {
  return page.evaluate(async () => {
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 0))),
    );
    const recorder = (window as unknown as { __qaVitals?: { read(): RecordedVitals } }).__qaVitals;
    if (!recorder) {
      throw new Error(
        'The web vitals recorder is not on this page: add recordVitals to the context before the visit navigates.',
      );
    }
    return recorder.read();
  });
}

/** The largest session window of layout shifts: a gap over 1 s or a window over 5 s starts another. */
export function cumulativeLayoutShift(shifts: readonly { startTime: number; value: number }[]) {
  let largest = 0;
  let current = 0;
  let first = -Infinity;
  let previous = -Infinity;
  for (const { startTime, value } of [...shifts].sort((a, b) => a.startTime - b.startTime)) {
    if (startTime - previous > 1_000 || startTime - first > 5_000) {
      current = 0;
      first = startTime;
    }
    current += value;
    previous = startTime;
    largest = Math.max(largest, current);
  }
  return largest;
}

/** The slowest interaction, leaving out one in every 50 as an outlier; null without interactions. */
export function interactionToNextPaint(durations: readonly number[]): number | null {
  if (durations.length === 0) return null;
  const slowestFirst = [...durations].sort((a, b) => b - a);
  return slowestFirst[Math.min(slowestFirst.length - 1, Math.floor(durations.length / 50))] ?? null;
}

export function toSample(recorded: RecordedVitals): VitalsSample {
  return {
    lcpMs: recorded.lcpMs === null ? null : Math.round(recorded.lcpMs),
    cls: Math.round(cumulativeLayoutShift(recorded.shifts) * 10_000) / 10_000,
    inpMs: interactionToNextPaint(recorded.interactions),
    interactions: recorded.interactions.length,
  };
}

/** The median of a list of numbers; the mean of the middle two for an even count. */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('The median of no values is undefined.');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] as number;
  return sorted.length % 2 ? upper : ((sorted[middle - 1] as number) + upper) / 2;
}

/**
 * The budget of a device project: `budgets.default`, with what `budgets.<device>` sets over it.
 * Null when neither gives a metric, so the caller can say that no budget is configured.
 */
export function budgetFor(
  config: WebVitalsConfig | null | undefined,
  device: string,
): VitalsBudget | null {
  if (!config) return null;
  const budget = { ...config.budgets.default, ...config.budgets[device] };
  return Object.keys(budget).length > 0 ? budget : null;
}

/** The medians of a set of samples; a metric no sample measured is null. */
export function medians(samples: readonly VitalsSample[]): {
  lcpMs: number | null;
  cls: number;
  inpMs: number | null;
} {
  const of = (values: (number | null)[]) => {
    const measured = values.filter((value): value is number => value !== null);
    return measured.length === values.length && measured.length > 0 ? median(measured) : null;
  };
  return {
    lcpMs: of(samples.map((sample) => sample.lcpMs)),
    cls: median(samples.map((sample) => sample.cls)),
    inpMs: of(samples.map((sample) => sample.inpMs)),
  };
}

/**
 * Why a set of samples breaks a budget, one line per metric; [] when it keeps it. A budgeted metric
 * that a visit did not measure (no contentful paint, no interaction) is a finding too: a budget
 * nothing measured never passes.
 */
export function budgetFindings(samples: readonly VitalsSample[], budget: VitalsBudget): string[] {
  const found: string[] = [];
  const middle = medians(samples);
  const check = (label: string, value: number | null, limit: number | undefined, unit: string) => {
    if (limit === undefined) return;
    if (value === null)
      found.push(`${label}: not measured on every visit (budget ${limit}${unit})`);
    else if (value > limit)
      found.push(`${label}: median ${value}${unit} over budget ${limit}${unit}`);
  };
  check('LCP', middle.lcpMs, budget.lcp_ms, ' ms');
  check('CLS', middle.cls, budget.cls, '');
  check('INP', middle.inpMs, budget.inp_ms, ' ms');
  return found;
}

/** How long a visit's interaction may take to appear among the entries after the visit. */
export const INTERACTION_WAIT_MS = 3_000;

/**
 * When the largest paint counts as settled: a candidate was reported and none followed for
 * `quietMs`. Past `timeoutMs` without a candidate the visit goes on, and LCP is reported as not
 * measured.
 */
export const LCP_SETTLE = { quietMs: 500, timeoutMs: 10_000 };

/** Wait until the page reported an LCP candidate and no larger one for `settle.quietMs`. */
export async function waitForLargestPaint(page: Page, settle = LCP_SETTLE): Promise<boolean> {
  return page.evaluate(
    ({ quietMs, timeoutMs }) =>
      new Promise<boolean>((done) => {
        const recorder = (window as unknown as { __qaVitals?: { read(): RecordedVitals } })
          .__qaVitals;
        const deadline = performance.now() + timeoutMs;
        const check = () => {
          const { lcpQuietMs } = recorder?.read() ?? { lcpQuietMs: null };
          if (lcpQuietMs !== null && lcpQuietMs >= quietMs) done(true);
          else if (performance.now() >= deadline) done(false);
          else setTimeout(check, 50);
        };
        check();
      }),
    settle,
  );
}

/** A visit: `load` opens the page and waits until it is ready, `interact` acts on it for INP. */
export interface Visit {
  load(page: Page): Promise<void>;
  interact(page: Page): Promise<void>;
}

/**
 * Measure `samples` visits, each in a context of its own (a cold cache, nothing left over from the
 * visit before), one after the other. `open` gives a new page whose context has not navigated yet.
 * Each visit loads the page, waits for its largest paint to settle (`waitForLargestPaint`), then
 * interacts. With `interaction`, a visit that recorded no interaction within `INTERACTION_WAIT_MS`
 * fails: the visit forgot its interaction, and INP would otherwise be judged on nothing.
 * `{ missing }` when the engine lacks an entry type; nothing is visited then.
 */
export async function measureVisits(
  open: () => Promise<{ page: Page; context: BrowserContext }>,
  visit: Visit,
  { samples, interaction }: { samples: number; interaction: boolean },
  settle = LCP_SETTLE,
): Promise<{ samples: VitalsSample[] } | { missing: string[] }> {
  const measured: VitalsSample[] = [];
  for (let i = 0; i < samples; i += 1) {
    const { page, context } = await open();
    try {
      if (i === 0) {
        const missing = await missingEntryTypes(page);
        if (missing.length > 0) return { missing };
      }
      await context.addInitScript(recordVitals);
      await visit.load(page);
      // The first input ends LCP: interacting before the largest paint was reported loses it.
      await waitForLargestPaint(page, settle);
      await visit.interact(page);
      let recorded = await readRecorded(page);
      const deadline = Date.now() + INTERACTION_WAIT_MS;
      while (interaction && recorded.interactions.length === 0 && Date.now() < deadline) {
        recorded = await readRecorded(page);
      }
      if (interaction && recorded.interactions.length === 0) {
        throw new Error(
          `Visit ${i + 1} recorded no interaction: INP needs the visit to press, click or tap something after the page is ready.`,
        );
      }
      measured.push(toSample(recorded));
    } finally {
      await context.close();
    }
  }
  return { samples: measured };
}

/** The failure message for a broken budget, with every sample, or null when the budget holds. */
export function vitalsReport(
  subject: string,
  samples: readonly VitalsSample[],
  budget: VitalsBudget,
): string | null {
  const findings = budgetFindings(samples, budget);
  if (findings.length === 0) return null;
  const lines = samples.map(
    (s, i) =>
      `  visit ${i + 1}: LCP ${s.lcpMs ?? '-'} ms, CLS ${s.cls}, INP ${s.inpMs ?? '-'} ms (${s.interactions} interaction(s))`,
  );
  return (
    `${subject} breaks its web vitals budget over ${samples.length} visit(s):\n` +
    `${findings.map((line) => `  ${line}`).join('\n')}\n${lines.join('\n')}`
  );
}
