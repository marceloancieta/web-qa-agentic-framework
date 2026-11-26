// The session browser server is named in three places: .mcp.json starts it, scripts/explore-browser.mjs
// attaches it to the launcher's port, and explore-guard lets only that name through. They must agree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXPLORE_SERVER } from '../../.claude/hooks/lib/explore.mjs';
import { SERVER, serverArgs } from '../explore-browser.mjs';
import { REPO_ROOT } from '../lib/cli.mjs';
import { DEFAULT_CDP_PORT } from '../lib/explore-session.mjs';

const mcp = JSON.parse(readFileSync(join(REPO_ROOT, '.mcp.json'), 'utf8'));

test('.mcp.json starts the server explore-guard lets through, with node and the wrapper', () => {
  const entry = mcp.mcpServers[EXPLORE_SERVER];
  assert.ok(entry, `.mcp.json declares ${EXPLORE_SERVER}`);
  assert.equal(entry.command, 'node');
  assert.deepEqual(entry.args, ['scripts/explore-browser.mjs']);
});

test('the wrapper runs a pinned Playwright MCP on the launcher port', () => {
  assert.match(SERVER, /^@playwright\/mcp@\d+\.\d+\.\d+$/);
  assert.deepEqual(serverArgs(), [
    '-y',
    SERVER,
    '--cdp-endpoint',
    `http://127.0.0.1:${DEFAULT_CDP_PORT}`,
  ]);
  assert.equal(serverArgs(9400).at(-1), 'http://127.0.0.1:9400');
});
