// Accessibility checks on axe, against a per-pack baseline of known violations
// (`apps/<pack>/a11y-known.json`). A violation is identified by its rule, the element and the
// route it was seen on. An entry names the element with a CSS selector the element matches, chosen
// to stay stable: axe's own target is the shortest unique selector of the moment, and on a
// framework's page it changes with the route, the form's state or the build (`.ng-valid`,
// `#mat-radio-43-input`). One entry can cover several elements, and route `*` covers a part of the
// page every route shows. Each violation is:
//   new      not in the baseline, or in it with an expiry that has passed: the check fails
//   known    in the baseline and not expired: reported, does not fail
// and a baseline entry for the scanned route that the scan no longer finds is reported as gone,
// so it can leave the baseline. An entry for every route (`*`) is never reported gone: a route
// without that part of the page says nothing about the others.

import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

export interface KnownViolation {
  rule: string;
  /**
   * A CSS selector the element matches, or axe's target exactly as it reported it (selectors
   * joined with " > " across frames).
   */
  target: string;
  /** The route the violation is on, a path such as `/#/login`, or `*` for every route. */
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
  /** The baseline selectors the element matches, as `scan` measured them on the page. */
  matches?: string[];
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
  const covers = (entry: KnownViolation, violation: FoundViolation) =>
    entry.rule === violation.rule &&
    (entry.route === '*' || entry.route === violation.route) &&
    (entry.target === violation.target || (violation.matches ?? []).includes(entry.target));
  const result: BaselineComparison = { new: [], known: [], gone: [] };
  const used = new Set<KnownViolation>();
  for (const violation of found) {
    const entries = baseline.filter((entry) => covers(entry, violation));
    entries.forEach((entry) => used.add(entry));
    const entry = entries.find((e) => e.expires >= today);
    if (entry) result.known.push({ ...violation, entry });
    else if (entries[0]) result.new.push({ ...violation, expired: entries[0] });
    else result.new.push(violation);
  }
  result.gone = baseline.filter((entry) => entry.route === route && !used.has(entry));
  return result;
}

/** The selectors of the baseline entries that can apply on a route. */
export function selectorsFor(baseline: readonly KnownViolation[], route: string): string[] {
  return [
    ...new Set(baseline.filter((e) => e.route === '*' || e.route === route).map((e) => e.target)),
  ];
}

/**
 * Run axe on the page and return its violations, one per element, plus the raw results. Each
 * violation lists which of `selectors` (the baseline's, `selectorsFor`) its element matches.
 */
export async function scan(page: Page, options: ScanOptions, selectors: readonly string[] = []) {
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
  if (selectors.length > 0) {
    // Only an element of the page itself can be matched; one inside a frame keeps its axe target.
    const targets = results.violations.flatMap((v) =>
      v.nodes.map((node) => (node.target.length === 1 ? String(node.target[0]) : null)),
    );
    const matched = await page.evaluate(
      ({ targets, selectors }) => {
        const invalid = selectors.filter((selector) => {
          try {
            document.querySelector(selector);
            return false;
          } catch {
            return true;
          }
        });
        if (invalid.length > 0) return { invalid, matches: [] };
        const matches = targets.map((target) => {
          const element = target === null ? null : document.querySelector(target);
          return element ? selectors.filter((selector) => element.matches(selector)) : [];
        });
        return { invalid, matches };
      },
      { targets, selectors: [...selectors] },
    );
    if (matched.invalid.length > 0) {
      throw new Error(`The a11y baseline has invalid selectors: ${matched.invalid.join(', ')}.`);
    }
    violations.forEach((violation, index) => {
      violation.matches = matched.matches[index] ?? [];
    });
  }
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
