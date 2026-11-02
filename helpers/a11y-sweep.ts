// The accessibility sweep: every route of a pack's app maps, opened as the role the map was walked
// as and scanned against the pack's baseline (`a11y.expectNoNewViolations`). The maps are the list:
// `docs/app-map.json` gives the anonymous routes, each `docs/app-map.<role>.json` the routes of that
// role, so a route only a role reaches is swept only as that role, and a route both reach is swept
// as each (the page differs signed in; the baseline keys a violation by rule, target and route, so
// one entry covers both). The maps record concrete routes, the ones the walk opened, so a route
// with an id in it is swept with the id the walk followed.
//
// A route is ready when what the map recorded for it is on screen: its headings, its named
// landmarks and the controls that are not part of every page (by role alone when they have no
// name: the delivery radios). A route whose map entry has none of them waits for its unnamed
// landmarks, and one without those for any of the controls every page shares (any, because a
// narrow layout hides some of them). Then it waits until its accessibility tree stops changing,
// for what the map cannot name: a CAPTCHA question or a list that arrives after the headings.
//
// The plan is read while Playwright collects the tests, so it never throws: a map that is missing
// or broken comes back as a problem, which the spec turns into a failing test.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { ANONYMOUS_ACTOR, REPO_ROOT } from './config';

type AriaRole = Parameters<Page['getByRole']>[0];

/** What the page must show before it is scanned: a role and an exact accessible name. */
export interface ReadyMark {
  role: AriaRole;
  name?: string;
  level?: number;
}

export interface SweepTarget {
  role: string;
  route: string;
  ready: ReadyMark[];
  /** `every` mark must be visible, or `any` one of them (the controls every page shares). */
  readyOn: 'every' | 'any';
}

export interface SweepPlan {
  targets: SweepTarget[];
  /** Why the sweep cannot be planned in full; each one should fail the lane. */
  problems: string[];
}

interface MapRoute {
  route: string;
  landmarks?: string[];
  headings?: string[];
  interactive?: string[];
}

const ROLE_MAP = /^app-map\.([a-z][a-z0-9-]*)\.json$/;
// The app map's lines: `h2 Name`, `region "Name"`, `button "Name" x15`.
const HEADING = /^h([1-6]) (.+)$/;
const NAMED = /^(\w+)(?: "((?:[^"\\]|\\.)*)")?(?: x\d+)?$/;
// A redacted value (`<EMAIL>`) stands for run data the page shows differently on every run.
const PLACEHOLDER = /<[A-Z_]+>/;

function parseNamed(line: string): ReadyMark | null {
  const match = NAMED.exec(line);
  if (!match) return null;
  const name = match[2]?.replace(/\\(.)/g, '$1');
  return { role: match[1] as AriaRole, ...(name ? { name } : {}) };
}

const usable = (mark: ReadyMark | null): mark is ReadyMark =>
  mark !== null && !PLACEHOLDER.test(mark.name ?? '');

/** The marks of one map entry; `shared` holds the interactive lines every route of the map has. */
export function readyMarks(
  entry: MapRoute,
  shared: ReadonlySet<string>,
): Pick<SweepTarget, 'ready' | 'readyOn'> {
  const headings = (entry.headings ?? []).flatMap((line) => {
    const match = HEADING.exec(line);
    return match ? [{ role: 'heading' as const, name: match[2], level: Number(match[1]) }] : [];
  });
  const landmarks = (entry.landmarks ?? []).map(parseNamed).filter(usable);
  const own = (entry.interactive ?? [])
    .filter((line) => !shared.has(line))
    .map(parseNamed)
    .filter(usable);
  const specific = [...headings.filter(usable), ...landmarks.filter((mark) => mark.name), ...own];
  if (specific.length > 0) return { ready: specific, readyOn: 'every' };
  const unnamed = landmarks.filter((mark) => !mark.name);
  if (unnamed.length > 0) return { ready: unnamed, readyOn: 'every' };
  const shell = [...shared]
    .map(parseNamed)
    .filter(usable)
    .filter((mark) => mark.name);
  return { ready: shell, readyOn: 'any' };
}

function readMap(file: string): { routes: MapRoute[] } | string {
  let map: { routes?: unknown };
  try {
    map = JSON.parse(readFileSync(file, 'utf8')) as { routes?: unknown };
  } catch (error) {
    return `cannot read ${file}: ${(error as Error).message}`;
  }
  const routes = map.routes;
  if (!Array.isArray(routes) || routes.length === 0) return `${file} lists no routes`;
  const bad = routes.find(
    (entry: Partial<MapRoute>) => typeof entry?.route !== 'string' || !entry.route.startsWith('/'),
  ) as Partial<MapRoute> | undefined;
  if (bad) return `${file} has a route that is not a path: ${JSON.stringify(bad.route)}`;
  return { routes: routes as MapRoute[] };
}

function targetsOf(role: string, routes: MapRoute[]): SweepTarget[] {
  const [first, ...rest] = routes.map((entry) => new Set(entry.interactive ?? []));
  const shared = new Set([...(first ?? [])].filter((line) => rest.every((set) => set.has(line))));
  return routes.map((entry) => ({ role, route: entry.route, ...readyMarks(entry, shared) }));
}

/**
 * The routes to sweep for a pack, per role: anonymous from `docs/app-map.json`, each role from
 * its `docs/app-map.<role>.json`. A missing anonymous map is a problem; role maps are optional.
 */
export function sweepPlan(pack: string, root = REPO_ROOT): SweepPlan {
  const docs = join(root, 'apps', pack, 'docs');
  const plan: SweepPlan = { targets: [], problems: [] };
  const anonymous = readMap(join(docs, 'app-map.json'));
  if (typeof anonymous === 'string') {
    plan.problems.push(`${anonymous}; write it with npm run app:map -- --pack ${pack} --write`);
  } else {
    plan.targets.push(...targetsOf(ANONYMOUS_ACTOR, anonymous.routes));
  }
  let files: string[] = [];
  try {
    files = readdirSync(docs);
  } catch {
    // No docs folder: the anonymous map is already reported missing.
  }
  for (const file of files.sort()) {
    const role = ROLE_MAP.exec(file)?.[1];
    if (!role) continue;
    const map = readMap(join(docs, file));
    if (typeof map === 'string') plan.problems.push(map);
    else plan.targets.push(...targetsOf(role, map.routes));
  }
  return plan;
}

/** How a page is read while it settles: the time between two readings and the whole wait. */
export interface Settle {
  intervalMs: number;
  timeoutMs: number;
}

/** A second between readings: an answer slower than that arrives after the scan. */
export const SETTLE: Settle = { intervalMs: 1_000, timeoutMs: 15_000 };

export interface SweepOptions {
  settle?: Settle;
  /** Reads the page's accessibility tree; `readTree` unless a test drives the page between readings. */
  read?: (page: Page) => Promise<string>;
}

/** The accessibility tree of the whole page, as one comparable string. */
export function readTree(page: Page): Promise<string> {
  return page.locator('body').ariaSnapshot();
}

/**
 * Resolve once two consecutive readings are the same; reject naming `subject` when the readings
 * still differ after `settle.timeoutMs`. Whether it settles depends on what the readings return,
 * never on how fast they come, so the outcome is the same on a loaded machine.
 */
export async function untilSteady(
  read: () => Promise<string>,
  subject: string,
  settle: Settle = SETTLE,
): Promise<void> {
  let previous: string | null = null;
  await expect
    .poll(
      async () => {
        const current = await read();
        const steady = current === previous;
        previous = current;
        return steady;
      },
      {
        message: `${subject} settles: its accessibility tree stops changing`,
        intervals: [settle.intervalMs],
        timeout: settle.timeoutMs,
      },
    )
    .toBe(true);
}

/**
 * Open a target's route, wait until its marks are visible (every one, or any one), then until two
 * readings of the page's accessibility tree `settle.intervalMs` apart are the same.
 */
export async function openForSweep(
  page: Page,
  target: SweepTarget,
  { settle = SETTLE, read = readTree }: SweepOptions = {},
): Promise<void> {
  await page.goto(target.route);
  const locators = target.ready.map((mark) =>
    page.getByRole(mark.role, {
      ...(mark.name !== undefined ? { name: mark.name, exact: true } : {}),
      ...(mark.level !== undefined ? { level: mark.level } : {}),
    }),
  );
  const [first, ...rest] = locators;
  // The map counts repeated elements once (`x15`); the first one being shown is enough.
  if (first && target.readyOn === 'any') {
    await expect(rest.reduce((either, next) => either.or(next), first).first()).toBeVisible();
  } else {
    for (const locator of locators) await expect(locator.first()).toBeVisible();
  }
  await untilSteady(() => read(page), target.route, settle);
}
