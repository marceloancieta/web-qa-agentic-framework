#!/usr/bin/env node
/**
 * The app map: what a pack's application shows, recorded by a read-only walk. It is the structural
 * source of intake, the way a contract is for an API, and it is tracked, so a change in the
 * application shows up as a diff.
 *
 *   node scripts/app-map.mjs --pack <pack> [--state <storage-state.json>] [--max-pages <n>]
 *       prints the map
 *   ... --write    writes apps/<pack>/docs/app-map.json
 *   ... --check    compares the live map with the tracked one; exit 1 on drift
 *
 * The walk is read-only by construction: every request that is not a GET, HEAD or OPTIONS is
 * aborted (and listed under `blocked_writes`), every request to another origin is aborted, and the
 * walk only navigates; it never clicks, types or submits. `--state` walks with a saved signed-in
 * browser state, such as one an actor fixture wrote.
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
/* global document */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
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

/** What an aria snapshot says: landmarks, headings and interactive elements with repeat counts. */
export function summarizeSnapshot(snapshot) {
  const landmarks = new Set();
  const headings = [];
  const counts = new Map();
  for (const line of snapshot.split('\n')) {
    const match = SNAPSHOT_LINE.exec(line);
    if (!match) continue;
    const [, role, name = '', rest] = match;
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
  log = () => {},
}) {
  const origin = new URL(baseUrl).origin;
  const excluded = exclude.map((pattern) => new RegExp(pattern));
  const isExcluded = (route) => excluded.some((pattern) => pattern.test(route));
  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: state });
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

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        pack: { type: 'string' },
        state: { type: 'string' },
        'max-pages': { type: 'string', default: '25' },
        write: { type: 'boolean', default: false },
        check: { type: 'boolean', default: false },
      },
    }));
    if (!values.pack) throw new Error('--pack <name> is required.');
    if (values.write && values.check) throw new Error('Use --write or --check, not both.');
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
  const { baseUrl } = packEntry(values.pack, REPO_ROOT);
  console.error(`app-map: walking ${values.pack} at ${baseUrl} (read-only)`);
  const walked = await walk({
    baseUrl,
    start: app.app_map?.start ?? ['/'],
    exclude: app.app_map?.exclude ?? [],
    maxPages: Number(values['max-pages']),
    state: values.state ? resolve(values.state) : undefined,
    log: (line) => console.error(line),
  });
  const map = { pack: values.pack, app_version: app.version, ...walked };
  const text = `${JSON.stringify(map, null, 2)}\n`;
  const target = join(REPO_ROOT, 'apps', values.pack, 'docs', 'app-map.json');
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
      `app-map: wrote ${map.routes.length} routes to apps/${values.pack}/docs/app-map.json.`,
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
