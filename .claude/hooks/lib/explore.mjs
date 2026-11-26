// The limits an agent works under while an exploratory session is open (ADR 0013), as a table of
// tool calls. `npm run explore -- open` writes reports/explore/open.json and the session's
// session.json; while they are there, `explore-guard` applies this table.
//
// During a session:
//   - The agent drives the session's browser through the MCP server named `explore-browser`
//     (Playwright MCP started with --cdp-endpoint, pointing at the endpoint `explore open` prints),
//     whose browser the launcher guards. Its navigation goes to the session's origin only; it runs
//     no code in the page and uploads nothing. Every other browser tool is refused: another
//     Playwright MCP server drives a browser of its own, outside the guard, and Claude in Chrome
//     holds the person's real sign-ins.
//   - Write and Edit inside the repository touch the session's sheet only; `explore close` also
//     fails on any other change, which catches what a script changed.
//   - Nothing reports to test management: a session has no case id and no run.
// Outside a session, the `explore-browser` server has no browser to drive and is refused.
//
// A hook sees a tool's name and arguments, not the network; the guard on the browser's context is
// what stops a write or another origin. A script started through Bash is seen by neither hook nor
// guard, which is why `explore close` compares the repository with its state at `open`.

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

export const EXPLORE_SERVER = 'explore-browser';
const OPEN_FILE = ['reports', 'explore', 'open.json'];
const SESSION_BROWSER = new RegExp(`^mcp__${EXPLORE_SERVER}__browser_(\\w+)$`);
const OTHER_PLAYWRIGHT = /^mcp__[\w-]*playwright[\w-]*__browser_\w+$/i;
const CHROME = /^mcp__claude-in-chrome__\w+$/;
const WRITES_FILES = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const SHELLS = new Set(['Bash', 'PowerShell']);
// `npm run tm:publish`, `npm run -s tm:report`, `node scripts/tm/...`
const REPORTS = /\bnpm\s+(?:run|run-script)\s+(?:-\S+\s+)*tm:|scripts[\\/]+tm[\\/]/;

const allowed = () => ({ decision: 'allow' });
const refused = (reason) => ({ decision: 'deny', reason });

/**
 * The open session under `root`: `{ id, sheet, origin }`, with null fields it cannot read, or null
 * when no session is open.
 */
export function openSession(root) {
  const openFile = join(root, ...OPEN_FILE);
  if (!existsSync(openFile)) return null;
  const read = (file) => {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  };
  const id = read(openFile)?.id ?? null;
  const state = id ? read(join(root, 'reports', 'explore', id, 'session.json')) : null;
  return { id, sheet: state?.sheet ?? null, origin: state?.plan?.origin ?? null };
}

function sessionTarget(url, origin) {
  const value = String(url ?? '').trim();
  if (value === '' || value === 'about:blank' || value === 'back' || value === 'forward')
    return allowed();
  let target;
  try {
    target = new URL(value).origin;
  } catch {
    return refused(`opens "${value}", which is not an address of the session's origin`);
  }
  if (origin && target === origin) return allowed();
  return refused(
    `opens ${target}; a session browses ${origin ?? 'its own origin'} only. A lead elsewhere is a proposed charter`,
  );
}

function sessionBrowser(action, input, session) {
  if (action === 'navigate') return sessionTarget(input?.url, session.origin);
  if (action === 'tabs' && input?.action === 'new')
    return sessionTarget(input?.url, session.origin);
  if (action === 'evaluate' || action === 'run_code_unsafe')
    return refused(
      'runs code in the page; a session uses the page as a person does, and reads it through snapshots',
    );
  if (action === 'file_upload')
    return refused('sends a file to the page; a session uploads nothing');
  return allowed();
}

/** A path of a Write or Edit relative to `root`, or null when it lies outside the repository. */
function repositoryPath(root, input) {
  const raw = input?.file_path ?? input?.notebook_path;
  if (typeof raw !== 'string' || raw === '') return '';
  const path = relative(resolve(root), resolve(root, raw));
  if (path.startsWith('..') || isAbsolute(path)) return null;
  return path.replace(/\\/g, '/');
}

/**
 * The verdict on one tool call: null when the call is no concern of this hook, otherwise
 * `{ decision: 'allow' | 'deny', reason? }`, the reason completing "the call ...".
 * @param {string} toolName
 * @param {object} input
 * @param {{ id: string|null, sheet: string|null, origin: string|null } | null} session
 * @param {string} root the project directory
 */
export function exploreVerdict(toolName, input, session, root) {
  const name = String(toolName ?? '');
  const inSession = SESSION_BROWSER.exec(name);
  if (!session) {
    return inSession
      ? refused(
          `drives the browser of an exploratory session, and none is open. Open one with npm run explore -- open <sheet>`,
        )
      : null;
  }
  if (inSession) return sessionBrowser(inSession[1], input, session);
  if (OTHER_PLAYWRIGHT.test(name))
    return refused(
      `drives a browser outside session ${session.id}'s guard. Drive the session's browser through the ${EXPLORE_SERVER} server`,
    );
  if (CHROME.test(name))
    return refused(
      `uses Claude in Chrome, which holds the person's real sign-ins. Drive session ${session.id} through the ${EXPLORE_SERVER} server`,
    );
  if (WRITES_FILES.has(name)) {
    const path = repositoryPath(root, input);
    if (path === null) return allowed();
    if (session.sheet && path === session.sheet) return allowed();
    return refused(
      `writes ${path || 'a file'} in the repository; during session ${session.id} only its sheet (${session.sheet ?? 'unknown'}) changes. Specs, registries and contracts change through their own phases after the debrief`,
    );
  }
  if (SHELLS.has(name) && REPORTS.test(String(input?.command ?? '')))
    return refused(
      `reports to test management; a session has no case id and no run, so it reports nothing. A case designed from a finding reports when it runs`,
    );
  return null;
}
