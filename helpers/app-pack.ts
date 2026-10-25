// An app pack's manifest, `apps/<name>/app.json`: what the application is and the facts about it
// that do not change between environments. Where it runs and which accounts it uses are in
// qa-config instead.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface AppManifest {
  name: string;
  /** The application version the pack was written against; part of every case's identity. */
  version: string;
  title: string;
  description?: string;
  /** The attribute `getByTestId` reads (Playwright's `testIdAttribute`). Default: `data-testid`. */
  testIdAttribute?: string;
  /** Where the login form is, relative to the base URL (`/login`, `/#/login`); the session probe
   * checks that it answers. */
  login_path?: string;
  /** The application's layout breakpoints, name to minimum width in CSS pixels. */
  breakpoints?: Record<string, number>;
  /** Hosts the pages call that are not the application (analytics, fonts, ads); mocks block them. */
  third_party_hosts?: string[];
  /** Keys whose values are secrets, on top of the built-in ones; redacted in evidence. */
  secret_keys?: string[];
  /** Keys whose values identify a person; pseudonymized in evidence. */
  identity_fields?: string[];
  /** The most workers that may run the pack's specs at once. Unset: no limit. */
  workers?: number;
  /** Visual comparison settings: the share of pixels that may differ, and a stylesheet (relative to
   * the pack) that hides volatile parts before a screenshot. */
  visual?: { maxDiffPixelRatio?: number; stylePath?: string };
  /**
   * Cookies every browser context of the pack starts with, name to value: a dismissed welcome or
   * consent banner, a fixed language. The test contexts and the app map's walk both get them. Never
   * a session: those come from the actors.
   */
  cookies?: Record<string, string>;
  /**
   * The app map's walk: routes to start from, route patterns never to visit, and per role the
   * routes only a signed-in user reaches (`npm run app:map -- --actor <role>`).
   */
  app_map?: {
    start?: string[];
    exclude?: string[];
    actors?: Record<string, { start?: string[] }>;
  };
}

export interface AppPack extends AppManifest {
  /** Absolute path of the pack directory. */
  dir: string;
}

const NAME = /^[a-z][a-z0-9-]*$/;
const VERSION = /^[a-z0-9][a-z0-9.-]*$/;
const ATTRIBUTE = /^[a-z][a-z0-9-]*$/;
const HOST = /^[a-z0-9.-]+(?::\d+)?$/i;
const COOKIE_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const SESSION_LIKE = /session|token|auth|jwt|sid|csrf/i;
const ROLE = /^[a-z][a-z0-9-]*$/;

const isWholeNumber = (value: unknown, min: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min;

/** What is wrong with a parsed manifest, one sentence each; empty when it is valid. */
export function manifestProblems(manifest: Partial<AppManifest>, dirName: string): string[] {
  const problems: string[] = [];
  if (!manifest.name || !NAME.test(manifest.name))
    problems.push('name must match ^[a-z][a-z0-9-]*$');
  else if (manifest.name !== dirName)
    problems.push(`name "${manifest.name}" must equal the folder name "${dirName}"`);
  if (!manifest.version || !VERSION.test(manifest.version)) {
    problems.push('version must match ^[a-z0-9][a-z0-9.-]*$ (it is part of every case identity)');
  }
  if (!manifest.title) problems.push('title is required');
  if (manifest.testIdAttribute !== undefined && !ATTRIBUTE.test(manifest.testIdAttribute)) {
    problems.push('testIdAttribute must be an attribute name such as data-test');
  }
  if (manifest.login_path !== undefined && !manifest.login_path.startsWith('/')) {
    problems.push('login_path must start with /, such as /login or /#/login');
  }
  for (const [name, width] of Object.entries(manifest.breakpoints ?? {})) {
    if (!isWholeNumber(width, 1)) problems.push(`breakpoints.${name} must be a width in pixels`);
  }
  for (const host of manifest.third_party_hosts ?? []) {
    if (!HOST.test(host))
      problems.push(`third_party_hosts has "${host}", which is not a host name`);
  }
  if (manifest.workers !== undefined && !isWholeNumber(manifest.workers, 1)) {
    problems.push('workers must be a whole number of at least 1');
  }
  for (const [name, value] of Object.entries(manifest.cookies ?? {})) {
    if (!COOKIE_NAME.test(name)) problems.push(`cookies has "${name}", which is not a cookie name`);
    else if (SESSION_LIKE.test(name))
      problems.push(`cookies.${name} looks like a session; sessions come from the actors`);
    if (typeof value !== 'string' || /[;\s]/.test(value))
      problems.push(`cookies.${name} must be a value without spaces or semicolons`);
  }
  const routeLists: [string, string[]][] = [['app_map.start', manifest.app_map?.start ?? []]];
  for (const [role, entry] of Object.entries(manifest.app_map?.actors ?? {})) {
    if (!ROLE.test(role)) problems.push(`app_map.actors has "${role}", which is not a role name`);
    routeLists.push([`app_map.actors.${role}.start`, entry.start ?? []]);
  }
  for (const [key, routes] of routeLists) {
    for (const route of routes) {
      if (!route.startsWith('/'))
        problems.push(`${key} has "${route}", which does not start with /`);
    }
  }
  for (const pattern of manifest.app_map?.exclude ?? []) {
    try {
      new RegExp(pattern);
    } catch {
      problems.push(`app_map.exclude has "${pattern}", which is not a regular expression`);
    }
  }
  const ratio = manifest.visual?.maxDiffPixelRatio;
  if (ratio !== undefined && !(typeof ratio === 'number' && ratio >= 0 && ratio <= 1)) {
    problems.push('visual.maxDiffPixelRatio must be a number from 0 to 1');
  }
  const stylePath = manifest.visual?.stylePath;
  if (stylePath !== undefined && !/^[\w./-]+\.css$/.test(stylePath)) {
    problems.push('visual.stylePath must be a .css file inside the pack');
  } else if (stylePath?.split('/').includes('..')) {
    problems.push('visual.stylePath must be a .css file inside the pack');
  }
  return problems;
}

export function loadAppPack(dir: string): AppPack {
  const file = join(dir, 'app.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as Partial<AppManifest>;
  const problems = manifestProblems(manifest, dir.split(/[\\/]/).pop() ?? '');
  if (problems.length > 0) throw new Error(`${file}: ${problems.join('; ')}.`);
  return { ...(manifest as AppManifest), dir };
}

/** The pack's cookies as Playwright adds them to a context on the application's base URL. */
export function contextCookies(
  app: Pick<AppManifest, 'cookies'>,
  baseUrl: string,
): { name: string; value: string; url: string }[] {
  return Object.entries(app.cookies ?? {}).map(([name, value]) => ({ name, value, url: baseUrl }));
}

/** Names of the app packs under `<root>/apps`: folders with an app.json. */
export function appPacks(root: string): string[] {
  const apps = join(root, 'apps');
  if (!existsSync(apps)) return [];
  return readdirSync(apps, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(apps, entry.name, 'app.json')))
    .map((entry) => entry.name)
    .sort();
}
