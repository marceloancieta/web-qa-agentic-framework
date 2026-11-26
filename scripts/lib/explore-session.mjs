// The decisions of an exploratory session (ADR 0013) that need no browser, kept apart from
// scripts/explore.mjs so each one is tested on its own:
//   planSession    whether a charter may start here and now, and with what: the target, the device,
//                  the signed-in role. A refusal names the reason.
//   guardDecision  what the route guard does with one request of the session's browser.
//   repoSnapshot / repoChanges
//                  what changed in the repository between `open` and `close`, outside the sheet.
//
// Where a session keeps its record: reports/explore/<session>/ (git ignores reports/), and
// reports/explore/open.json names the session that is open, so only one is at a time.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizePath } from '../app-map.mjs';
import { gitEnv } from './git.mjs';
import { packVariable } from './qa-config.mjs';
import { timeBox } from './session-sheet.mjs';

export const EXPLORE_DIR = 'reports/explore';
export const OPEN_FILE = `${EXPLORE_DIR}/open.json`;
export const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const DEFAULT_CDP_PORT = 9322;

/** The folder of a session's record, relative to the repository root. */
export const recordDir = (id) => `${EXPLORE_DIR}/${id}`;

/**
 * Whether a charter may start, and with what.
 * @param {object} input
 * @param {object} input.charter        the parsed charter (`parseSheet`), already free of problems
 * @param {object} input.environment    `activeEnvironment`: `{ source, name, packs }`
 * @param {object} input.app            the pack's app.json
 * @param {{ name: string, browser: string }[]} input.projects  the device projects (`deviceProjects`)
 * @param {object} [input.env]          the process environment, for QA_<PACK>_BASE_URL
 * @returns {{ refusal: string } | { plan: object }}
 */
export function planSession({ charter, environment, app, projects, env = process.env }) {
  const { pack, role, device, driver, writes, minutes } = charter;
  const { source, name, packs } = environment;
  if (/^prod/i.test(name))
    return { refusal: `environment "${name}" looks like production; a session never runs there.` };
  if (charter.environment !== name)
    return {
      refusal: `the charter names environment "${charter.environment}", but "${name}" is active; set QA_ENV=${charter.environment} or change the charter.`,
    };
  const entry = packs[pack];
  if (!entry)
    return {
      refusal: `${source} has no app.environments.${name}.packs.${pack}: a session runs only where qa-config names the pack.`,
    };
  const configured = new URL(entry.base_url).origin;
  const override = env[packVariable(pack, 'BASE_URL')];
  if (override && new URL(override).origin !== configured)
    return {
      refusal: `${packVariable(pack, 'BASE_URL')} points at ${new URL(override).origin}, not ${configured} as ${source} names; a session runs only on the hosts qa-config names.`,
    };
  if (writes === 'allowed') {
    if (entry.allow_writes !== true)
      return {
        refusal: `${pack} does not allow writes in "${name}" (allow_writes); this charter must say writes: none.`,
      };
    if (!app.explore?.copy)
      return {
        refusal: `a writing session runs on a disposable copy of the application, and ${pack} declares none (app.json explore.copy); this charter must say writes: none.`,
      };
  }
  if (role !== 'anonymous' && !Object.hasOwn(entry.actors ?? {}, role))
    return {
      refusal: `${pack} has no actor "${role}" in "${name}"; the roles are ${Object.keys(entry.actors ?? {}).join(', ') || '(none)'}, or anonymous.`,
    };
  const project = projects.find((p) => p.name === device);
  if (!project)
    return {
      refusal: `no device project "${device}"; the projects are ${projects.map((p) => p.name).join(', ')}.`,
    };
  if (project.browser !== 'chromium')
    return {
      refusal: `${device} runs on ${project.browser}; a session runs on a Chromium project, since an agent attaches to its browser over CDP.`,
    };
  const { most } = timeBox(driver);
  if (minutes > most)
    return {
      refusal: `the time box is ${minutes} minutes; ${driver} sessions last ${most} at most.`,
    };
  return {
    plan: {
      pack,
      environment: name,
      baseUrl: (override || entry.base_url).replace(/\/+$/, ''),
      origin: configured,
      routes: charter.routes,
      role,
      device,
      driver,
      writes,
      minutes,
      sessionWrites: app.app_map?.session_writes ?? [],
      cookies: app.cookies ?? {},
    },
  };
}

/**
 * What the guard does with one request.
 * @param {{ method: string, url: string }} request
 * @param {{ origin: string, writes: 'none'|'allowed', sessionWrites?: string[] }} plan
 * @returns {{ allow: boolean, reason?: 'origin'|'write', write?: string }}
 */
export function guardDecision({ method, url }, { origin, writes, sessionWrites = [] }) {
  const parsed = new URL(url);
  if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') return { allow: true };
  if (parsed.origin !== origin) return { allow: false, reason: 'origin' };
  if (writes === 'allowed' || READ_METHODS.has(method.toUpperCase())) return { allow: true };
  const write = `${method.toUpperCase()} ${normalizePath(parsed.pathname)}`;
  const renewals = sessionWrites.map((entry) => {
    const [verb, path] = entry.split(' ');
    return `${verb.toUpperCase()} ${normalizePath(path)}`;
  });
  // A renewal of the session the pack declares changes no data, like the login.
  if (renewals.includes(write)) return { allow: true };
  return { allow: false, reason: 'write', write };
}

function git(args, root) {
  const result = spawnSync('git', args, { cwd: root, env: gitEnv(), encoding: 'utf8' });
  if (result.status !== 0)
    throw new Error(`git ${args[0]} failed: ${(result.stderr || '').trim() || result.error}`);
  return result.stdout;
}

const digest = (root, path) => {
  const file = join(root, path);
  return existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : 'gone';
};

/**
 * The state of the working tree that `close` compares against: HEAD, and a digest of every file git
 * reports as changed or untracked (ignored files such as reports/ are not read).
 * @returns {{ head: string, files: Record<string, string> }}
 */
export function repoSnapshot(root) {
  const head = git(['rev-parse', 'HEAD'], root).trim();
  const files = {};
  const entries = git(['status', '--porcelain=v1', '-z', '-uall'], root).split('\0');
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    const status = entry.slice(0, 2);
    files[entry.slice(3)] = digest(root, entry.slice(3));
    if (status.includes('R') || status.includes('C')) index += 1; // the source of a rename
  }
  return { head, files };
}

/**
 * What changed between two snapshots, outside the paths a session may write.
 * @returns {string[]} one line per change
 */
export function repoChanges(before, after, allowed = []) {
  const changes = [];
  if (before.head !== after.head)
    changes.push(`HEAD moved from ${before.head.slice(0, 7)} to ${after.head.slice(0, 7)}`);
  const paths = new Set([...Object.keys(before.files), ...Object.keys(after.files)]);
  for (const path of [...paths].sort()) {
    if (allowed.includes(path)) continue;
    if (before.files[path] === after.files[path]) continue;
    if (!(path in before.files)) changes.push(`${path} changed`);
    else if (!(path in after.files)) changes.push(`${path} was restored`);
    else changes.push(`${path} changed again`);
  }
  return changes;
}
