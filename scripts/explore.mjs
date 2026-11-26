#!/usr/bin/env node
/**
 * The one door to a chartered exploratory session (ADR 0013). A person, an agent or both drive a
 * browser this script owns, with a guard and a recording on its context.
 *
 *   npm run explore -- open apps/<pack>/docs/sessions/<date>-<slug>.md [--headed | --headless]
 *                          [--cdp-port <port>]
 *       checks the charter and the target, then starts the session's browser in the background,
 *       signed in as the charter's role, on its first route. An agent attaches to it over CDP
 *       (Playwright MCP with --cdp-endpoint <the endpoint it prints>). One session at a time.
 *   npm run explore -- status
 *       the open session: its time left and whether its browser is still there
 *   npm run explore -- close
 *       stops the browser, saves the record and checks the session: its record is not empty, the
 *       repository changed nowhere but the sheet, and the sheet is well formed. Exit 1 when a check
 *       fails; the session is closed either way.
 *
 * In the browser:
 *   - Every request to another origin is aborted. In a session with `writes: none`, so is every
 *     request that is not GET, HEAD or OPTIONS, except a session renewal the pack declares (app.json
 *     `app_map.session_writes`); controls may be used, their writes never leave. The guard sits on
 *     the browser's context, so it also holds for a page an agent opens over CDP.
 *   - The role signs in from the newest state a spec run wrote for it, so no password passes through
 *     the session. Service workers are blocked, so none can send around the guard.
 *   - The time box closes the browser and keeps the record; so does closing the window.
 *
 * The record, in reports/explore/<session>/ (never tracked): `trace-NN.zip` (a Playwright trace,
 * saved every two minutes so a closed window loses little), `requests.jsonl` (method, path, status,
 * no query strings), `blocked.json`, `session.json` (the plan and the state) and `launcher.log`.
 * Writing sessions, which need a disposable copy of the application, are refused until the pack
 * declares one (app.json `explore.copy`).
 *
 * Exit codes: 0 done; 1 refused, or a check failed at close; 2 usage error.
 */

// The functions passed to addInitScript and page.evaluate run in the browser.
/* global window */

import { spawn } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium, devices } from '@playwright/test';
import { latestStatePath, readState } from './lib/auth-state.mjs';
import { REPO_ROOT } from './lib/cli.mjs';
import { deviceProjects } from './lib/devices.mjs';
import {
  DEFAULT_CDP_PORT,
  OPEN_FILE,
  guardDecision,
  planSession,
  recordDir,
  repoChanges,
  repoSnapshot,
} from './lib/explore-session.mjs';
import { activeEnvironment } from './lib/qa-config.mjs';
import { parseSheet, stampSheet } from './lib/session-sheet.mjs';

const TOOL = 'explore';
const CHUNK_MS = 2 * 60_000;
const POLL_MS = 500;
const START_TIMEOUT_MS = 90_000;
const STOP_TIMEOUT_MS = 60_000;
const SEED_PATH = '/__explore_seed__';

const now = () => new Date().toISOString();
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const at = (root, path) => join(root, ...path.split('/'));

class Refusal extends Error {}

/**
 * Remove the session's browser profile. On Windows the browser can still hold a file for a moment
 * after it closed, so this retries, and reports what it could not remove instead of failing.
 */
function removeProfile(profile) {
  if (!profile) return null;
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    return null;
  } catch (error) {
    return `the browser profile ${profile} could not be removed (${error.code}); delete it by hand`;
  }
}

/** Whether a process still runs. */
export function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function portFree(port) {
  return new Promise((done) => {
    const server = createServer();
    server.once('error', () => done(false));
    server.listen(port, '127.0.0.1', () => server.close(() => done(true)));
  });
}

/** The open session as `{ id, pid, sheet, state, dir }`, or null. */
export function openSession(root = REPO_ROOT) {
  const file = at(root, OPEN_FILE);
  if (!existsSync(file)) return null;
  const { id } = readJson(file);
  const dir = at(root, recordDir(id));
  const stateFile = join(dir, 'session.json');
  const state = existsSync(stateFile) ? readJson(stateFile) : null;
  return { id, dir, state };
}

// ---------------------------------------------------------------------------------------- open

async function open({ sheet, headed, cdpPort, root = REPO_ROOT }) {
  const current = openSession(root);
  if (current)
    throw new Refusal(`session ${current.id} is open; close it first (npm run explore -- close).`);
  const sheetPath = relative(root, resolve(sheet)).replace(/\\/g, '/');
  if (!existsSync(at(root, sheetPath))) throw new Refusal(`no sheet at ${sheetPath}.`);
  const text = readFileSync(at(root, sheetPath), 'utf8');
  const { id, charter, problems } = parseSheet(text, sheetPath);
  if (problems.length > 0)
    throw new Refusal(
      `the sheet is not ready:\n${problems.map((p) => `  ${sheetPath}:${p.line}  ${p.message}`).join('\n')}`,
    );
  if (charter.opened)
    throw new Refusal(
      `this sheet's session was opened at ${charter.opened}; another look is a new charter, with a sheet of its own.`,
    );
  const app = readJson(at(root, `apps/${charter.pack}/app.json`));
  const environment = activeEnvironment(root);
  const decided = planSession({ charter, environment, app, projects: deviceProjects(root) });
  if (decided.refusal) throw new Refusal(decided.refusal);
  const { plan } = decided;
  let stateFile = null;
  if (plan.role !== 'anonymous') {
    stateFile = latestStatePath(join(root, '.auth'), plan.environment, plan.pack, plan.role);
    if (!stateFile)
      throw new Refusal(
        `no signed-in state for "${plan.role}" in "${plan.environment}" yet. Run a spec that signs ` +
          `${plan.role} in first, such as npx playwright test --project=${plan.pack}-${plan.device} --grep @smoke.`,
      );
  }
  if (!(await portFree(cdpPort)))
    throw new Refusal(`port ${cdpPort} is taken; pass --cdp-port <a free port>.`);

  const dir = at(root, recordDir(id));
  rmSync(dir, { recursive: true, force: true }); // a start that never ran leaves only its own record
  mkdirSync(dir, { recursive: true });
  const openedAt = now();
  writeJson(join(dir, 'session.json'), {
    id,
    sheet: sheetPath,
    plan,
    stateFile,
    cdpPort,
    // A person needs a window to drive; an agent alone reads the page through its tools.
    headed: headed ?? plan.driver !== 'agent',
    snapshot: repoSnapshot(root),
    status: 'starting',
    openedAt,
  });
  const log = openSync(join(dir, 'launcher.log'), 'a');
  const child = spawn(process.execPath, [join(import.meta.dirname, 'explore.mjs'), 'serve', id], {
    cwd: root,
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true,
  });
  child.unref();

  const deadline = Date.now() + START_TIMEOUT_MS;
  let state = readJson(join(dir, 'session.json'));
  while (state.status === 'starting' && Date.now() < deadline && alive(child.pid)) {
    await sleep(POLL_MS);
    state = readJson(join(dir, 'session.json'));
  }
  if (state.status !== 'running') {
    if (alive(child.pid)) process.kill(child.pid);
    const tail = readFileSync(join(dir, 'launcher.log'), 'utf8').trim().split('\n').slice(-8);
    throw new Refusal(`the session's browser did not start:\n  ${tail.join('\n  ')}`);
  }
  writeJson(at(root, OPEN_FILE), { id, pid: child.pid });
  writeFileSync(at(root, sheetPath), stampSheet(text, { opened: openedAt }));
  console.log(`${TOOL}: session ${id} is open until ${state.deadline} (${plan.minutes} minutes).`);
  console.log(
    `  ${plan.pack} at ${plan.baseUrl}, ${plan.device}, as ${plan.role}, writes: ${plan.writes}`,
  );
  console.log(
    `  CDP endpoint ${state.cdp}: an agent's Playwright MCP attaches with --cdp-endpoint.`,
  );
  console.log(`  record: ${recordDir(id)}/   close: npm run explore -- close`);
}

// --------------------------------------------------------------------------------------- serve

/** The browser of a session: runs detached until the stop file, the time box or a closed window. */
async function serve(id, root = REPO_ROOT) {
  const dir = at(root, recordDir(id));
  const stateFile = join(dir, 'session.json');
  const state = readJson(stateFile);
  const { plan } = state;
  const save = (changes) => writeJson(stateFile, Object.assign(state, changes));
  const catalog = readJson(join(root, 'helpers', 'device-projects.json'));
  // The engine is Chromium by the plan; the rest of the descriptor is the device.
  const device = { ...devices[catalog.projects[plan.device].descriptor] };
  delete device.defaultBrowserType;
  const profile = mkdtempSync(join(tmpdir(), 'web-qa-explore-'));
  save({ profile });

  const context = await chromium.launchPersistentContext(profile, {
    ...device,
    headless: !state.headed,
    serviceWorkers: 'block',
    acceptDownloads: false,
    args: [`--remote-debugging-port=${state.cdpPort}`],
  });
  // What someone did in the browser, as opposed to what the launcher's own first load did: pages
  // loaded after it, and trusted input events (a person's, or an agent's through CDP, which the
  // page sees as real input). Without either, close reports an empty record.
  const counts = { documents: 0, inputs: 0, requests: 0, blocked: 0 };
  let started = false;
  await context.exposeBinding('__exploreInput', () => {
    if (started) counts.inputs += 1;
  });
  await context.addInitScript(() => {
    for (const type of ['pointerdown', 'keydown', 'input']) {
      window.addEventListener(
        type,
        (event) => event.isTrusted && window.__exploreInput?.().catch(() => {}),
        { capture: true },
      );
    }
  });
  const blocked = [];
  const requests = join(dir, 'requests.jsonl');
  const where = (url) => {
    const parsed = new URL(url);
    return parsed.origin === plan.origin ? parsed.pathname : parsed.origin;
  };
  await context.route('**/*', (route) => {
    const request = route.request();
    const decision = guardDecision({ method: request.method(), url: request.url() }, plan);
    if (decision.allow) return route.continue();
    counts.blocked += 1;
    blocked.push({
      at: now(),
      method: request.method(),
      where: where(request.url()),
      reason: decision.reason,
    });
    return route.abort('blockedbyclient');
  });
  const seed = `${plan.origin}${SEED_PATH}`;
  const record = (request, status) => {
    if (request.url().startsWith(seed)) return;
    counts.requests += 1;
    if (started && request.resourceType() === 'document' && status !== 'failed')
      counts.documents += 1;
    appendFileSync(
      requests,
      `${JSON.stringify({ at: now(), method: request.method(), where: where(request.url()), type: request.resourceType(), status })}\n`,
    );
  };
  context.on('requestfinished', async (request) =>
    record(request, (await request.response().catch(() => null))?.status() ?? 'finished'),
  );
  context.on('requestfailed', (request) => record(request, 'failed'));

  // The role's session: cookies, then local and session storage written once on a blank page of
  // the origin, so the application finds them on its first load and the person can change them.
  const session = state.stateFile ? readState(state.stateFile) : null;
  await context.addCookies([
    ...Object.entries(plan.cookies).map(([name, value]) => ({ name, value, url: plan.origin })),
    ...(session?.storageState.cookies ?? []),
  ]);
  const page = context.pages()[0] ?? (await context.newPage());
  const local =
    session?.storageState.origins?.find((o) => o.origin === plan.origin)?.localStorage ?? [];
  const sessionItems = session?.sessionStorage.find((s) => s.origin === plan.origin)?.items ?? {};
  if (local.length > 0 || Object.keys(sessionItems).length > 0) {
    await page.route(seed, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>seed</title>' }),
    );
    await page.goto(seed);
    await page.evaluate(
      ({ localItems, items }) => {
        for (const { name, value } of localItems) window.localStorage.setItem(name, value);
        for (const [name, value] of Object.entries(items))
          window.sessionStorage.setItem(name, value);
      },
      { localItems: local, items: sessionItems },
    );
    await page.unroute(seed);
  }

  let chunk = 1;
  const chunkPath = () => join(dir, `trace-${String(chunk).padStart(2, '0')}.zip`);
  await context.tracing.start({ screenshots: true, snapshots: true, title: id });
  await context.tracing.startChunk({ title: `${id} part ${chunk}` });
  await page.goto(`${plan.baseUrl}${plan.routes[0]}`).catch(() => {});
  started = true;

  const deadline = new Date(Date.now() + plan.minutes * 60_000).toISOString();
  save({
    status: 'running',
    pid: process.pid,
    cdp: `http://127.0.0.1:${state.cdpPort}`,
    deadline,
    counts,
  });

  let finishing = null;
  const finish = (ended) =>
    (finishing ??= (async () => {
      await context.tracing.stopChunk({ path: chunkPath() }).catch(() => {});
      await context.tracing.stop().catch(() => {});
      await context.close().catch(() => {});
      const leftover = removeProfile(profile);
      writeJson(join(dir, 'blocked.json'), blocked);
      save({ status: 'stopped', ended, stoppedAt: now(), counts, leftover });
      process.exit(0);
    })());
  context.on('close', () => finish('window closed'));
  const rotate = setInterval(async () => {
    if (finishing) return;
    await context.tracing.stopChunk({ path: chunkPath() }).catch(() => {});
    chunk += 1;
    save({ counts });
    await context.tracing.startChunk({ title: `${id} part ${chunk}` }).catch(() => {});
  }, CHUNK_MS);
  rotate.unref();
  setTimeout(() => finish('time box'), plan.minutes * 60_000).unref();
  const stopFile = join(dir, 'stop');
  let saved = JSON.stringify(counts);
  for (;;) {
    if (existsSync(stopFile)) return finish('closed');
    await sleep(POLL_MS);
    // Kept current, so a browser that dies without finishing still leaves what was done.
    if (!finishing && JSON.stringify(counts) !== saved) {
      saved = JSON.stringify(counts);
      save({ counts });
    }
  }
}

// --------------------------------------------------------------------------------------- close

async function close({ root = REPO_ROOT }) {
  const current = openSession(root);
  if (!current) throw new Refusal('no session is open.');
  const { id, dir } = current;
  const { pid } = readJson(at(root, OPEN_FILE));
  const stateFile = join(dir, 'session.json');
  let state = current.state;
  if (state?.status === 'running' && alive(pid)) {
    writeFileSync(join(dir, 'stop'), now());
    const deadline = Date.now() + STOP_TIMEOUT_MS;
    while (state.status !== 'stopped' && Date.now() < deadline) {
      await sleep(POLL_MS);
      state = readJson(stateFile);
    }
  }
  if (state?.status !== 'stopped') {
    if (alive(pid)) process.kill(pid);
    const leftover = removeProfile(state?.profile);
    state = { ...state, status: 'stopped', ended: 'interrupted', stoppedAt: now(), leftover };
    writeJson(stateFile, state);
  }
  rmSync(join(dir, 'stop'), { force: true });
  rmSync(at(root, OPEN_FILE), { force: true });

  const problems = [];
  const counts = state.counts ?? { documents: 0, inputs: 0, requests: 0, blocked: 0 };
  if (counts.documents === 0 && counts.inputs === 0)
    problems.push(
      'the record is empty: nobody loaded a page or used a control in the session browser. A session is driven in the browser explore open starts.',
    );
  for (const change of repoChanges(state.snapshot, repoSnapshot(root), [state.sheet]))
    problems.push(`the repository changed outside the sheet: ${change}`);
  const sheetFile = at(root, state.sheet);
  if (existsSync(sheetFile)) {
    const stamped = stampSheet(readFileSync(sheetFile, 'utf8'), {
      closed: now(),
      ended: state.ended,
    });
    writeFileSync(sheetFile, stamped);
    for (const p of parseSheet(stamped, state.sheet).problems)
      problems.push(`${state.sheet}:${p.line}  ${p.message}`);
  } else problems.push(`the sheet ${state.sheet} is gone`);
  writeJson(stateFile, { ...state, closeProblems: problems });

  const minutes = Math.round((Date.parse(state.stoppedAt) - Date.parse(state.openedAt)) / 60_000);
  console.log(`${TOOL}: session ${id} ended (${state.ended}) after ${minutes} minutes.`);
  console.log(
    `  ${counts.documents} pages loaded, ${counts.inputs} inputs, ${counts.requests} requests, ${counts.blocked} blocked; record in ${recordDir(id)}/`,
  );
  if (state.leftover) console.log(`  note: ${state.leftover}`);
  for (const problem of problems) console.error(`  check failed: ${problem}`);
  return problems.length === 0 ? 0 : 1;
}

// -------------------------------------------------------------------------------------- status

/** One line on the open session, or null; the session probe prints it at the start of a session. */
export function sessionLine(root = REPO_ROOT) {
  const current = openSession(root);
  if (!current) return null;
  const { id, state } = current;
  const { pid } = readJson(at(root, OPEN_FILE));
  if (state?.status === 'stopped')
    return `Exploration: session ${id} ended (${state.ended}) and waits for npm run explore -- close.`;
  if (state?.status !== 'running' || !alive(pid))
    return `Exploration: session ${id} was interrupted (its browser is gone); run npm run explore -- close.`;
  const left = Math.max(0, Math.round((Date.parse(state.deadline) - Date.now()) / 60_000));
  return `Exploration: session ${id} is open, ${left} minutes left, CDP ${state.cdp}; close with npm run explore -- close.`;
}

// ---------------------------------------------------------------------------------------- main

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        headed: { type: 'boolean' },
        headless: { type: 'boolean' },
        'cdp-port': { type: 'string', default: String(DEFAULT_CDP_PORT) },
      },
    });
  } catch (error) {
    console.error(`${TOOL}: ${error.message}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const [command, argument] = positionals;
  try {
    if (command === 'open') {
      if (!argument) throw new SyntaxError('open takes the path of a session sheet.');
      if (values.headed && values.headless) throw new SyntaxError('use --headed or --headless.');
      const port = Number(values['cdp-port']);
      if (!Number.isInteger(port) || port < 1024 || port > 65535)
        throw new SyntaxError('--cdp-port takes a port from 1024 to 65535.');
      const headed = values.headed ? true : values.headless ? false : undefined;
      await open({ sheet: argument, headed, cdpPort: port });
      return 0;
    }
    if (command === 'serve') {
      await serve(argument);
      return 0;
    }
    if (command === 'close') return await close({});
    if (command === 'status') {
      console.log(sessionLine() ?? `${TOOL}: no session is open.`);
      return 0;
    }
    throw new SyntaxError('usage: explore open <sheet> | status | close');
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error(`${TOOL}: ${error.message}`);
      return 2;
    }
    if (error instanceof Refusal) {
      console.error(`${TOOL}: refused: ${error.message}`);
      return 1;
    }
    throw error;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(
    (code) => {
      if (code !== undefined) process.exitCode = code;
    },
    (error) => {
      console.error(`${TOOL}: ${error.stack ?? error.message}`);
      process.exitCode = 1;
    },
  );
}
