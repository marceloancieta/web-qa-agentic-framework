// Controlled time for cases about session timeouts, countdowns and dates, on Playwright's clock.
// Install the clock before the page loads, so every timer the page creates is under its control.

import type { Page } from '@playwright/test';

const UNIT_MS: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** A duration such as `90s`, `15m`, `1h30m` or `250ms`, in milliseconds. */
export function durationMs(text: string): number {
  const parts = [...text.matchAll(/(\d+)(ms|s|m|h|d)/g)];
  if (parts.length === 0 || parts.map((part) => part[0]).join('') !== text.replace(/\s+/g, '')) {
    throw new Error(`"${text}" is not a duration such as 90s, 15m, 1h30m or 250ms.`);
  }
  return parts.reduce(
    (total, [, amount, unit]) => total + Number(amount) * (UNIT_MS[unit as string] ?? 0),
    0,
  );
}

/** Start the page's clock at a fixed moment; time then moves only when `advance` says so. */
export async function startClockAt(page: Page, at: string | Date): Promise<void> {
  const time = typeof at === 'string' ? new Date(at) : at;
  if (Number.isNaN(time.getTime())) throw new Error(`"${String(at)}" is not a date.`);
  await page.clock.install({ time });
  await page.clock.pauseAt(time);
}

/** Move the page's clock forward, firing every timer that falls due on the way. */
export async function advance(page: Page, duration: string | number): Promise<void> {
  await page.clock.runFor(typeof duration === 'number' ? duration : durationMs(duration));
}
