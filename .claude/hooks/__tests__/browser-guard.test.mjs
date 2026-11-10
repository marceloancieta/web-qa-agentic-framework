// browser-guard: the browser limits of design, checked on an agent's browser tool calls. Each table
// holds calls that must pass beside the ones that must not, so a rule that matches too much fails too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHook, tempProject } from './harness.mjs';
import { onlyMoves } from '../lib/browser.mjs';

const CONFIG = {
  app: {
    default_environment: 'local',
    environments: {
      local: { packs: { 'juice-shop': { base_url: 'http://localhost:3000' } } },
      ci: { packs: { saucedemo: { base_url: 'https://www.saucedemo.com' } } },
    },
  },
};
const dir = tempProject({ config: CONFIG });

const call = (tool_name, tool_input = {}) => ({
  hook_event_name: 'PreToolUse',
  tool_name,
  tool_input,
});
const pw = (action) => `mcp__playwright__browser_${action}`;
const chrome = (tool) => `mcp__claude-in-chrome__${tool}`;
const computer = (input) => [chrome('computer'), { tabId: 1, ...input }];

async function verdictOf([tool, input], options = {}) {
  return (await runHook('browser-guard.mjs', call(tool, input), { projectDir: dir, ...options }))
    .verdict;
}

async function expectAll(rows, expected, options) {
  for (const row of rows) {
    assert.equal(await verdictOf(row, options), expected, JSON.stringify(row));
  }
}

test('calls that only read pass', async () => {
  await expectAll(
    [
      [pw('snapshot')],
      [pw('take_screenshot'), { fullPage: true }],
      [pw('console_messages')],
      [pw('network_requests')],
      [pw('find'), { text: 'Login' }],
      [pw('hover'), { element: 'Account menu', ref: 'e12' }],
      [pw('wait_for'), { text: 'Apple Juice' }],
      [pw('resize'), { width: 390, height: 844 }],
      [pw('navigate_back')],
      [pw('tabs'), { action: 'list' }],
      [pw('tabs'), { action: 'select', index: 1 }],
      [pw('press_key'), { key: 'Tab' }],
      [pw('press_key'), { key: 'ArrowDown' }],
      [pw('handle_dialog'), { accept: false }],
      [chrome('read_page'), { tabId: 1 }],
      [chrome('get_page_text'), { tabId: 1 }],
      [chrome('tabs_context_mcp')],
      [chrome('read_network_requests'), { tabId: 1 }],
      computer({ action: 'screenshot' }),
      computer({ action: 'scroll', coordinate: [10, 10], scroll_direction: 'down' }),
      computer({ action: 'zoom', region: [0, 0, 100, 100] }),
      computer({ action: 'key', text: 'Tab Tab shift+Tab Escape' }),
    ],
    'allow',
  );
});

test('navigation passes to the base URLs of every environment qa-config names', async () => {
  await expectAll(
    [
      [pw('navigate'), { url: 'http://localhost:3000/#/search?q=apple' }],
      [pw('navigate'), { url: 'https://www.saucedemo.com/inventory.html' }],
      [pw('tabs'), { action: 'new', url: 'http://localhost:3000/#/login' }],
      [chrome('navigate'), { url: 'www.saucedemo.com', tabId: 1 }],
      [chrome('navigate'), { url: 'back', tabId: 1 }],
      [pw('navigate'), { url: 'about:blank' }],
    ],
    'allow',
  );
});

test('navigation elsewhere is asked: another port, another host, a look-alike, no URL', async () => {
  await expectAll(
    [
      [pw('navigate'), { url: 'http://localhost:3001/' }],
      [pw('navigate'), { url: 'https://saucedemo.com/' }],
      [pw('navigate'), { url: 'https://www.saucedemo.com.example.net/' }],
      [pw('navigate'), { url: 'http://www.saucedemo.com/' }],
      [pw('navigate'), { url: 'file:///C:/Windows/win.ini' }],
      [pw('navigate'), { url: 'http://[bad' }],
      [chrome('navigate'), { url: 'https://example.com', tabId: 1 }],
      [pw('tabs'), { action: 'new', url: 'https://example.com' }],
    ],
    'ask',
  );
});

test('the active environment override counts as a named base URL', async () => {
  const row = [pw('navigate'), { url: 'http://127.0.0.1:3100/#/login' }];
  assert.equal(await verdictOf(row), 'ask');
  assert.equal(
    await verdictOf(row, {
      env: { QA_ENV: 'local', QA_JUICE_SHOP_BASE_URL: 'http://127.0.0.1:3100' },
    }),
    'allow',
  );
});

test('calls whose effect depends on the page are asked', async () => {
  await expectAll(
    [
      [pw('click'), { element: 'Log in', ref: 'e7' }],
      [pw('type'), { element: 'Email', ref: 'e5', text: 'someone', submit: true }],
      [pw('fill_form'), { fields: [] }],
      [pw('select_option'), { element: 'Sort', ref: 'e3', values: ['za'] }],
      [pw('press_key'), { key: 'Enter' }],
      [pw('press_key'), { key: ' ' }],
      [pw('press_key'), { key: 'a' }],
      [pw('handle_dialog'), { accept: true }],
      [pw('evaluate'), { function: '() => document.title' }],
      [pw('run_code_unsafe'), { code: 'await page.title()' }],
      [pw('drag'), {}],
      computer({ action: 'left_click', coordinate: [5, 5] }),
      computer({ action: 'type', text: 'apple' }),
      computer({ action: 'key', text: 'Tab Return' }),
      computer({ action: 'left_click_drag', coordinate: [5, 5] }),
      [chrome('form_input'), { ref: 'ref_1', value: 'x', tabId: 1 }],
      [chrome('javascript_tool'), { text: 'document.title', tabId: 1 }],
    ],
    'ask',
  );
});

test('an upload is refused', async () => {
  await expectAll(
    [
      [pw('file_upload'), { paths: ['a.png'] }],
      [chrome('file_upload'), { paths: ['a.png'], ref: 'ref_1', tabId: 1 }],
      [chrome('upload_image'), { imageId: 'x', tabId: 1 }],
    ],
    'deny',
  );
});

test('a browser tool the guard does not know is asked, never passed', async () => {
  await expectAll(
    [
      [pw('mouse_click_xy'), { x: 1, y: 1 }],
      [chrome('shortcuts_execute')],
      [`mcp__plugin_playwright_playwright__browser_click`],
    ],
    'ask',
  );
});

test('a batch is as strict as its strictest step', async () => {
  const step = (name, input) => ({ name, input: { tabId: 1, ...input } });
  const batch = (...actions) => [chrome('browser_batch'), { actions }];
  await expectAll(
    [batch(step('navigate', { url: 'http://localhost:3000' }), step('read_page'))],
    'allow',
  );
  await expectAll(
    [
      batch(step('read_page'), step('computer', { action: 'left_click', coordinate: [1, 1] })),
      batch(step('navigate', { url: 'https://example.com' })),
      batch(step('browser_batch', { actions: [] })),
      [chrome('browser_batch'), { actions: [] }],
    ],
    'ask',
  );
  await expectAll(
    [
      batch(
        step('computer', { action: 'type', text: 'x' }),
        step('upload_image', { imageId: 'x' }),
      ),
    ],
    'deny',
  );
});

test('tools of other servers and other events pass untouched', async () => {
  await expectAll(
    [
      ['Bash', { command: 'npm test' }],
      ['mcp__claude_ai_Vercel__list_projects'],
      ['mcp__playwright_api__send_request'],
      ['WebFetch', { url: 'https://example.com' }],
    ],
    'allow',
  );
  const post = { ...call(pw('click'), { ref: 'e1' }), hook_event_name: 'PostToolUse' };
  assert.equal((await runHook('browser-guard.mjs', post, { projectDir: dir })).verdict, 'allow');
});

test('the reason names the rule it applies', async () => {
  const r = await runHook('browser-guard.mjs', call(pw('click'), { ref: 'e1' }), {
    projectDir: dir,
  });
  assert.match(r.output.hookSpecificOutput.permissionDecisionReason, /modes\.md.*login_path/s);
});

test('a key press only moves when every key in it does', () => {
  for (const keys of ['Tab', 'shift+Tab', 'Page_Down', 'Arrow-Up', 'Esc Esc', 'Home End']) {
    assert.ok(onlyMoves(keys), keys);
  }
  for (const keys of ['', 'Enter', 'Return', 'space', 'Tab Enter', 'ctrl+a', 'Delete']) {
    assert.ok(!onlyMoves(keys), keys);
  }
});

test('settings.json sends every browser tool the guard reads to it, and no other tool', () => {
  const settings = JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'settings.json'),
      'utf8',
    ),
  );
  const entry = settings.hooks.PreToolUse.find((group) =>
    group.hooks.some((hook) => hook.args?.some((arg) => arg.endsWith('/browser-guard.mjs'))),
  );
  assert.ok(entry, 'browser-guard is registered');
  const matcher = new RegExp(`^(?:${entry.matcher})$`);
  for (const tool of [
    pw('click'),
    'mcp__plugin_playwright_playwright__browser_type',
    chrome('computer'),
    chrome('browser_batch'),
  ]) {
    assert.ok(matcher.test(tool), tool);
  }
  for (const tool of [
    'Bash',
    'mcp__claude_ai_Vercel__list_projects',
    'mcp__playwright_api__send_request',
  ]) {
    assert.ok(!matcher.test(tool), tool);
  }
});
