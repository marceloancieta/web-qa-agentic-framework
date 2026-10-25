#!/usr/bin/env node
/**
 * The app map: what a pack's application shows, recorded by a read-only walk. It is the structural
 * source of intake, the way a contract is for an API, and it is tracked, so a change in the
 * application shows up as a diff.
 *
 *   node scripts/app-map.mjs --pack <pack> [--actor <role> | --state <file>] [--max-pages <n>]
 *       prints the map
 *   ... --write    writes apps/<pack>/docs/app-map.json, or docs/app-map.<role>.json with --actor
 *   ... --check    compares the live map with the tracked one; exit 1 on drift
 *
 * The walk is read-only by construction: every request that is not a GET, HEAD or OPTIONS is
 * aborted (and listed under `blocked_writes`), every request to another origin is aborted, and the
 * walk only navigates; it never clicks, types or submits. Every context gets the pack's app.json
 * `cookies` (dismissed banners, a fixed language), so the map shows the page a test sees.
 * `--actor <role>` walks signed in, with the newest browser state an actor fixture wrote for that
 * role (session storage included), adding the routes of app.json `app_map.actors.<role>.start`;
 * `--state <file>` names a state file instead.
 *
 * Per route it records the title, the landmarks, the headings, the interactive elements by role
 * and accessible name (with a count when one repeats), the form fields with their HTML constraints,
 * the same-origin API calls the page made (ids in paths become `:id`) and the links it offers.
 * The routes to start from come from app.json `app_map.start` (default `/`); links found on the
 * way are followed up to `--max-pages`, except those matching `app_map.exclude`.
 *
 * Exit codes: 0 done (or no drift); 1 drift or a failed walk; 2 usage error.
 */

// The functions passed to page.evaluate run in the browser.
/* global document, location, window */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { latestStatePath, readState } from './lib/auth-state.mjs';
import { REPO_ROOT } from './lib/cli.mjs';
import { packEntry } from './lib/qa-config.mjs';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LANDMARKS = new Set([
  'banner',
  'navigation',
  'main',
  'contentinfo',
  'search',
  'complementary',
  'form',
  'region',
]);
const INTERACTIVE = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'checkbox',
  'radio',
  'combobox',
  'switch',
  'slider',
  'tab',
  'menuitem',
]);
const SNAPSHOT_LINE = /^\s*- (\w+)(?: "((?:[^"\\]|\\.)*)")?(.*)$/;

/** A path with numeric and uuid-like segments replaced by `:id`. */
export function normalizePath(path) {
  return path
    .split('/')
    .map((part) =>
      /^\d+$/.test(part) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(part) ? ':id' : part,
    )
    .join('/');
}

/** The route of a same-origin URL as the map keys it: path plus hash, without the query. */
export function routeOf(url) {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.hash}`;
}

// An email in a name is the signed-in account, which every spec run creates anew: kept, it would
// make the tracked map drift on every walk and put an account into the repository.
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

/** What an aria snapshot says: landmarks, headings and interactive elements with repeat counts. */
export function summarizeSnapshot(snapshot) {
  const landmarks = new Set();
  const headings = [];
  const counts = new Map();
  for (const line of snapshot.split('\n')) {
    const match = SNAPSHOT_LINE.exec(line);
    if (!match) continue;
    const [, role, rawName = '', rest] = match;
    const name = rawName.replace(EMAIL, '<EMAIL>');
    if (LANDMARKS.has(role)) landmarks.add(name ? `${role} "${name}"` : role);
    if (role === 'heading') {
      const level = /\[level=(\d)\]/.exec(rest)?.[1] ?? '?';
      headings.push(`h${level} ${name}`);
    }
    if (INTERACTIVE.has(role)) {
      const key = `${role} "${name}"`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const interactive = [...counts]
    .map(([key, count]) => (count > 1 ? `${key} x${count}` : key))
    .sort();
  return { landmarks: [...landmarks].sort(), headings, interactive };
}

/** The form fields of the page with their HTML constraints, in document order. */
function readFields(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('input, select, textarea'))
      .filter((field) => field.type !== 'hidden')
      .map((field) => {
        const labelledBy = (field.getAttribute('aria-labelledby') ?? '')
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
          .join(' ')
          .trim();
        const label =
          field.getAttribute('aria-label') ||
          labelledBy ||
          field.labels?.[0]?.textContent?.trim() ||
          '';
        const constraints = {};
        for (const name of [
          'required',
          'minlength',
          'maxlength',
          'pattern',
          'min',
          'max',
          'step',
          'autocomplete',
          'inputmode',
          'accept',
        ]) {
          if (field.hasAttribute(name)) constraints[name] = field.getAttribute(name) || true;
        }
        return {
          tag: field.tagName.toLowerCase(),
          type: field.getAttribute('type') ?? '',
          label: label.replace(/\s+/g, ' '),
          constraints,
        };
      }),
  );
}

function readLinks(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map((a) => a.href));
}

/** Walk the application and return the map. `log` receives one line per visited route. */
export async function walk({
  baseUrl,
  start = ['/'],
  exclude = [],
  maxPages = 25,
  state,
  sessionStorage = [],
  cookies = {},
  log = () => {},
}) {
  const origin = new URL(baseUrl).origin;
  const excluded = exclude.map((pattern) => new RegExp(pattern));
  const isExcluded = (route) => excluded.some((pattern) => pattern.test(route));
  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: state });
  await context.addCookies(
    Object.entries(cookies).map(([name, value]) => ({ name, value, url: origin })),
  );
  for (const { origin: target, items } of sessionStorage) {
    await context.addInitScript(
      ({ target: where, entries }) => {
        if (location.origin !== where) return;
        for (const [name, value] of entries) window.sessionStorage.setItem(name, value);
      },
      { target, entries: Object.entries(items) },
    );
  }
  const blockedWrites = new Set();
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort('blockedbyclient');
    if (!READ_METHODS.has(request.method())) {
      blockedWrites.add(`${request.method()} ${normalizePath(url.pathname)}`);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  const queue = [...start];
  const seen = new Set(queue);
  const routes = [];
  try {
    while (queue.length > 0 && routes.length < maxPages) {
      const route = queue.shift();
      const page = await context.newPage();
      const calls = new Set();
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.origin === origin && ['xhr', 'fetch'].includes(request.resourceType())) {
          calls.add(`${request.method()} ${normalizePath(url.pathname)}`);
        }
      });
      await page.goto(`${origin}${route}`, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      const summary = summarizeSnapshot(await page.locator('body').ariaSnapshot());
      const links = new Set();
      for (const href of await readLinks(page)) {
        const url = new URL(href);
        if (url.origin !== origin) continue;
        const next = routeOf(href);
        links.add(next);
        if (!seen.has(next) && !isExcluded(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
      routes.push({
        route,
        title: await page.title(),
        ...summary,
        fields: await readFields(page),
        api_calls: [...calls].sort(),
        links: [...links].sort(),
      });
      log(`  ${route}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  routes.sort((a, b) => a.route.localeCompare(b.route));
  return { routes, blocked_writes: [...blockedWrites].sort() };
}

/** The routes whose entry differs between two maps, plus routes only in one of them. */
export function drift(tracked, live) {
  const index = (map) => new Map(map.routes.map((entry) => [entry.route, JSON.stringify(entry)]));
  const before = index(tracked);
  const after = index(live);
  const changes = [];
  for (const [route, entry] of after) {
    if (!before.has(route)) changes.push(`added    ${route}`);
    else if (before.get(route) !== entry) changes.push(`changed  ${route}`);
  }
  for (const route of before.keys()) if (!after.has(route)) changes.push(`removed  ${route}`);
  return changes.sort((a, b) => a.slice(9).localeCompare(b.slice(9)));
}

const ROLE = /^[a-z][a-z0-9-]*$/;

/** The tracked map of a pack, relative to the pack: one for anonymous visitors, one per actor. */
export function mapFile(actor) {
  return actor ? `docs/app-map.${actor}.json` : 'docs/app-map.json';
}

/** The routes a walk starts from: the pack's start routes, plus those only the actor reaches. */
export function walkStart(app, actor) {
  const start = app.app_map?.start ?? ['/'];
  const extra = actor ? (app.app_map?.actors?.[actor]?.start ?? []) : [];
  return [...new Set([...start, ...extra])];
}

/**
 * The newest browser state an actor fixture wrote for a role, found by role so the command line
 * never names the file. A spec run that signs the role in writes it.
 */
export function actorSession(root, environment, pack, actor) {
  const file = latestStatePath(join(root, '.auth'), environment, pack, actor);
  if (!file) {
    throw new Error(
      `no signed-in state for "${actor}" in environment "${environment}" yet. Run a spec that ` +
        `signs ${actor} in first, such as npx playwright test --project=${pack}-desktop-chromium ` +
        `--grep @smoke.`,
    );
  }
  const written = statSync(file).mtime.toISOString().slice(0, 16).replace('T', ' ');
  console.error(`app-map: using the ${actor} session a spec run wrote at ${written} UTC`);
  return readState(file);
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        pack: { type: 'string' },
        state: { type: 'string' },
        actor: { type: 'string' },
        'max-pages': { type: 'string', default: '25' },
        write: { type: 'boolean', default: false },
        check: { type: 'boolean', default: false },
      },
    }));
    if (!values.pack) throw new Error('--pack <name> is required.');
    if (values.write && values.check) throw new Error('Use --write or --check, not both.');
    if (values.actor && values.state) throw new Error('Use --actor or --state, not both.');
    if (values.actor && !ROLE.test(values.actor))
      throw new Error('--actor must be a role name, such as customer.');
  } catch (error) {
    console.error(`app-map: ${error.message}`);
    process.exit(2);
  }
  const appFile = join(REPO_ROOT, 'apps', values.pack, 'app.json');
  if (!existsSync(appFile)) {
    console.error(`app-map: no app pack "${values.pack}" (missing ${appFile}).`);
    process.exit(2);
  }
  const app = JSON.parse(readFileSync(appFile, 'utf8'));
  const { baseUrl, environment } = packEntry(values.pack, REPO_ROOT);
  let session = null;
  if (values.actor) session = actorSession(REPO_ROOT, environment, values.pack, values.actor);
  else if (values.state) session = readState(resolve(values.state));
  const as = values.actor ? ` as ${values.actor}` : '';
  console.error(`app-map: walking ${values.pack} at ${baseUrl}${as} (read-only)`);
  const walked = await walk({
    baseUrl,
    start: walkStart(app, values.actor),
    exclude: app.app_map?.exclude ?? [],
    maxPages: Number(values['max-pages']),
    state: session?.storageState,
    sessionStorage: session?.sessionStorage,
    cookies: app.cookies ?? {},
    log: (line) => console.error(line),
  });
  const map = {
    pack: values.pack,
    app_version: app.version,
    ...(values.actor ? { actor: values.actor } : {}),
    ...walked,
  };
  const text = `${JSON.stringify(map, null, 2)}\n`;
  const target = join(REPO_ROOT, 'apps', values.pack, mapFile(values.actor));
  if (values.check) {
    if (!existsSync(target)) {
      console.error(`app-map: no tracked map at ${target}; write one with --write.`);
      process.exit(1);
    }
    const changes = drift(JSON.parse(readFileSync(target, 'utf8')), map);
    if (changes.length === 0) {
      console.log(`app-map: ${values.pack} matches its tracked map (${map.routes.length} routes).`);
      return;
    }
    console.error(`app-map: ${values.pack} drifted from its tracked map:`);
    for (const change of changes) console.error(`  ${change}`);
    process.exit(1);
  }
  if (values.write) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    console.log(
      `app-map: wrote ${map.routes.length} routes to apps/${values.pack}/${mapFile(values.actor)}.`,
    );
    return;
  }
  process.stdout.write(text);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`app-map: ${error.message}`);
    process.exit(1);
  });
}
