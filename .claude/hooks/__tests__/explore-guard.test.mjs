// explore-guard: the limits of an exploratory session, checked on an agent's tool calls. Each table
// holds calls that must pass beside the ones that must not, so a rule that matches too much fails too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runHook, tempProject } from './harness.mjs';

const SHEET = 'apps/shop/docs/sessions/2026-11-26-cart.md';
const SESSION = {
  id: '2026-11-26-cart',
  sheet: SHEET,
  plan: { origin: 'http://localhost:4000', writes: 'none' },
  status: 'running',
};
const open = tempProject({
  files: {
    'reports/explore/open.json': JSON.stringify({ id: SESSION.id, pid: 1 }),
    [`reports/explore/${SESSION.id}/session.json`]: JSON.stringify(SESSION),
  },
});
const closed = tempProject();

const call = (tool_name, tool_input = {}) => ({
  hook_event_name: 'PreToolUse',
  tool_name,
  tool_input,
});
const session = (action) => `mcp__explore-browser__browser_${action}`;

async function verdictOf([tool, input], dir) {
  return (await runHook('explore-guard.mjs', call(tool, input), { projectDir: dir })).verdict;
}

async function expectAll(rows, expected, dir) {
  for (const row of rows) {
    assert.equal(await verdictOf(row, dir), expected, JSON.stringify(row));
  }
}

test('outside a session, only the session browser is refused', async () => {
  await expectAll(
    [
      [session('navigate'), { url: 'http://localhost:4000/' }],
      [session('snapshot'), {}],
    ],
    'deny',
    closed,
  );
  await expectAll(
    [
      ['mcp__playwright__browser_click', { element: 'Save', target: 'e1' }],
      ['Write', { file_path: join(closed, 'apps/shop/specs/cart.spec.ts'), content: '' }],
      ['Bash', { command: 'npm run tm:publish' }],
    ],
    'allow',
    closed,
  );
  const result = await runHook('explore-guard.mjs', call(session('snapshot')), {
    projectDir: closed,
  });
  assert.match(
    result.output.hookSpecificOutput.permissionDecisionReason,
    /none is open\. Open one with npm run explore -- open <sheet>/,
  );
});

test('in a session, the session browser acts freely on its own origin', async () => {
  await expectAll(
    [
      [session('click'), { element: 'Remove', target: 'f1e3' }],
      [session('type'), { element: 'Search', target: 'f1e4', text: 'apple' }],
      [session('fill_form'), { fields: [] }],
      [session('press_key'), { key: 'Enter' }],
      [session('handle_dialog'), { accept: true }],
      [session('snapshot'), {}],
      [session('navigate'), { url: 'http://localhost:4000/cart' }],
      [session('navigate'), { url: 'about:blank' }],
      [session('tabs'), { action: 'new', url: 'http://localhost:4000/inventory' }],
      [session('tabs'), { action: 'select', index: 1 }],
      [session('navigate_back'), {}],
    ],
    'allow',
    open,
  );
});

test('in a session, the session browser leaves its origin, runs code and uploads nothing', async () => {
  await expectAll(
    [
      [session('navigate'), { url: 'https://www.example.com/' }],
      [session('navigate'), { url: 'http://localhost:4001/' }],
      [session('navigate'), { url: 'localhost:4000/cart' }],
      [session('tabs'), { action: 'new', url: 'https://other.example.com/' }],
      [session('evaluate'), { function: '() => document.title' }],
      [session('run_code_unsafe'), { code: 'await page.title()' }],
      [session('file_upload'), { paths: ['a.png'] }],
    ],
    'deny',
    open,
  );
  const result = await runHook(
    'explore-guard.mjs',
    call(session('navigate'), { url: 'https://www.example.com/a' }),
    { projectDir: open },
  );
  assert.match(
    result.output.hookSpecificOutput.permissionDecisionReason,
    /opens https:\/\/www\.example\.com; a session browses http:\/\/localhost:4000 only/,
  );
});

test('in a session, every other browser is refused', async () => {
  await expectAll(
    [
      ['mcp__playwright__browser_snapshot', {}],
      ['mcp__plugin_playwright_playwright__browser_navigate', { url: 'http://localhost:4000/' }],
      ['mcp__claude-in-chrome__read_page', { tabId: 1 }],
      ['mcp__claude-in-chrome__navigate', { url: 'http://localhost:4000/' }],
    ],
    'deny',
    open,
  );
  await expectAll(
    [
      ['mcp__claude_ai_Vercel__list_projects', {}],
      ['mcp__ide__getDiagnostics', {}],
    ],
    'allow',
    open,
  );
});

test('in a session, the repository changes only in the sheet', async () => {
  await expectAll(
    [
      ['Edit', { file_path: join(open, SHEET), old_string: 'a', new_string: 'b' }],
      ['Write', { file_path: SHEET, content: '' }],
      ['Write', { file_path: join(open, '..', 'scratch', 'notes.md'), content: '' }],
      ['Read', { file_path: join(open, 'apps/shop/specs/cart.spec.ts') }],
    ],
    'allow',
    open,
  );
  await expectAll(
    [
      ['Write', { file_path: join(open, 'apps/shop/specs/cart.spec.ts'), content: '' }],
      ['Edit', { file_path: join(open, 'apps/shop/registry/cart.md'), old_string: 'a' }],
      ['MultiEdit', { file_path: join(open, 'apps/shop/docs/sessions/2026-11-26-other.md') }],
      ['NotebookEdit', { notebook_path: join(open, 'notes.ipynb') }],
    ],
    'deny',
    open,
  );
});

test('in a session, nothing reports to test management', async () => {
  await expectAll(
    [
      ['Bash', { command: 'npm run tm:report' }],
      ['Bash', { command: 'npm run -s tm:publish -- --pack shop' }],
      ['PowerShell', { command: 'node scripts/tm/publish.mjs' }],
      ['Bash', { command: 'node scripts\\tm\\report.mjs' }],
    ],
    'deny',
    open,
  );
  await expectAll(
    [
      ['Bash', { command: 'npm run explore -- status' }],
      ['Bash', { command: 'git status' }],
      ['Bash', { command: 'grep -rn "tm:" docs' }],
      ['Bash', { command: 'npm run html:tm-report' }],
    ],
    'allow',
    open,
  );
});

test('a session whose record cannot be read still keeps its browser and its repository', async () => {
  const broken = tempProject({ files: { 'reports/explore/open.json': '{"id":"2026-11-26-x"}' } });
  await expectAll(
    [
      [session('navigate'), { url: 'http://localhost:4000/' }],
      ['Write', { file_path: join(broken, 'apps/shop/docs/sessions/2026-11-26-x.md') }],
    ],
    'deny',
    broken,
  );
});
