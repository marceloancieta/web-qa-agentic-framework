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
}

export interface AppPack extends AppManifest {
  /** Absolute path of the pack directory. */
  dir: string;
}

const NAME = /^[a-z][a-z0-9-]*$/;
const VERSION = /^[a-z0-9][a-z0-9.-]*$/;
const ATTRIBUTE = /^[a-z][a-z0-9-]*$/;
const HOST = /^[a-z0-9.-]+(?::\d+)?$/i;

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

/** Names of the app packs under `<root>/apps`: folders with an app.json. */
export function appPacks(root: string): string[] {
  const apps = join(root, 'apps');
  if (!existsSync(apps)) return [];
  return readdirSync(apps, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(apps, entry.name, 'app.json')))
    .map((entry) => entry.name)
    .sort();
}
