// Where actor fixtures keep a role's signed-in browser state, and how a tool finds the newest one,
// so no command line ever has to name a file in that folder: the secret guard refuses those.
//
// A state file is Playwright's saved state (`cookies`, `origins`) plus `sessionStorage`, the
// session storage the application expects per origin, which Playwright's own state does not keep.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** `<authDir>/<env>/<pack>/<role>-<worker>.json`. */
export function statePath(authDir, environment, pack, role, worker) {
  return join(authDir, environment, pack, `${role}-${worker}.json`);
}

/** The most recently written state of a role, or null when no spec run has signed it in yet. */
export function latestStatePath(authDir, environment, pack, role) {
  const dir = join(authDir, environment, pack);
  if (!existsSync(dir)) return null;
  const name = new RegExp(`^${role.replace(/[^a-z0-9-]/gi, '')}-\\d+\\.json$`);
  const files = readdirSync(dir)
    .filter((file) => name.test(file))
    .map((file) => join(dir, file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}

/** A state file split into what Playwright restores and the session storage to write by hand. */
export function readState(file) {
  const { sessionStorage = [], ...storageState } = JSON.parse(readFileSync(file, 'utf8'));
  return { storageState, sessionStorage };
}
