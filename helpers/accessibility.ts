// Accessibility checks on axe, against a per-pack baseline of known violations
// (`apps/<pack>/a11y-known.json`). A violation is identified by its rule, the element's target
// selector and the route it was seen on. Each one is:
//   new      not in the baseline, or in it with an expiry that has passed: the check fails
//   known    in the baseline and not expired: reported, does not fail
// and a baseline entry for the scanned route that the scan no longer finds is reported as gone,
// so it can leave the baseline.

import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

export interface KnownViolation {
  rule: string;
  /** The element, as axe reports its target (selectors joined with " > " across frames). */
  target: string;
  /** The route the violation is on, a path such as `/#/login`. */
  route: string;
  /** The tracker issue that follows it. */
  key: string;
  /** The day the entry stops excusing the violation, `YYYY-MM-DD`. */
  expires: string;
}

export interface FoundViolation {
  rule: string;
  impact: string;
  target: string;
  route: string;
  help: string;
}

export interface BaselineComparison {
  new: (FoundViolation & { expired?: KnownViolation })[];
  known: (FoundViolation & { entry: KnownViolation })[];
  gone: KnownViolation[];
}

export interface ScanOptions {
  tags: readonly string[];
  include?: readonly string[];
  exclude?: readonly string[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The baseline of a pack, checked entry by entry. A missing file is an empty baseline. */
export function loadBaseline(file: string): KnownViolation[] {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const entries = JSON.parse(text) as Partial<KnownViolation>[];
  const problems = entries.flatMap((entry, index) =>
    (['rule', 'target', 'route', 'key', 'expires'] as const)
      .filter((field) => typeof entry[field] !== 'string' || !entry[field])
      .map((field) => `entry ${index} has no ${field}`)
      .concat(
        entry.expires && !DATE.test(entry.expires)
          ? [`entry ${index} expires is not YYYY-MM-DD`]
          : [],
      ),
  );
  if (problems.length > 0) throw new Error(`${file}: ${problems.join('; ')}.`);
  return entries as KnownViolation[];
}

/** The route of a page URL as the baseline records it: path, query and hash. */
export function routeOf(url: string): string {
  const parsed = new URL(url);
  if (!parsed.protocol.startsWith('http')) return url;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/** Split found violations into new and known, and list the baseline entries no longer seen. */
export function compareWithBaseline(
  found: readonly FoundViolation[],
  baseline: readonly KnownViolation[],
  route: string,
  today = new Date().toISOString().slice(0, 10),
): BaselineComparison {
  const key = (v: { rule: string; target: string; route: string }) =>
    `${v.rule}|${v.target}|${v.route}`;
  const entries = new Map(baseline.map((entry) => [key(entry), entry]));
  const result: BaselineComparison = { new: [], known: [], gone: [] };
  for (const violation of found) {
    const entry = entries.get(key(violation));
    if (!entry) result.new.push(violation);
    else if (entry.expires < today) result.new.push({ ...violation, expired: entry });
    else result.known.push({ ...violation, entry });
  }
  const seen = new Set(found.map(key));
  result.gone = baseline.filter((entry) => entry.route === route && !seen.has(key(entry)));
  return result;
}

/** Run axe on the page and return its violations, one per element, plus the raw results. */
export async function scan(page: Page, options: ScanOptions) {
  let builder = new AxeBuilder({ page }).withTags([...options.tags]);
  for (const selector of options.include ?? []) builder = builder.include(selector);
  for (const selector of options.exclude ?? []) builder = builder.exclude(selector);
  const results = await builder.analyze();
  const route = routeOf(page.url());
  const violations: FoundViolation[] = results.violations.flatMap((violation) =>
    violation.nodes.map((node) => ({
      rule: violation.id,
      impact: node.impact ?? violation.impact ?? 'unknown',
      target: node.target
        .map((part) => (Array.isArray(part) ? part.join(' ') : String(part)))
        .join(' > '),
      route,
      help: violation.help,
    })),
  );
  return { route, violations, results };
}

/** The failure message for new violations, or null when there are none. */
export function violationReport(
  comparison: BaselineComparison,
  baselineFile: string,
): string | null {
  if (comparison.new.length === 0) return null;
  const lines = comparison.new.map((v) => {
    const expired = v.expired
      ? ` (baseline entry ${v.expired.key} expired ${v.expired.expires})`
      : '';
    return `  [${v.impact}] ${v.rule} at ${v.target}: ${v.help}${expired}`;
  });
  return (
    `${comparison.new.length} new accessibility violation(s) on ${comparison.new[0]?.route}:\n` +
    `${lines.join('\n')}\nFix them, or file each one and add it to ${baselineFile} with its ` +
    'tracker key and an expiry.'
  );
}
