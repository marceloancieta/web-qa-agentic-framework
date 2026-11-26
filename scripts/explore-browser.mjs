#!/usr/bin/env node
// The MCP server `explore-browser` of .mcp.json (ADR 0013): Playwright MCP, at the version pinned
// below, attached over CDP to the browser `npm run explore -- open` starts. It is the one browser
// tool `explore-guard` lets an agent use while a session is open, and it has no browser to drive
// while none is.
//
// The server speaks MCP on stdin and stdout, which this script hands straight through. It goes
// through npx so the repository does not depend on the server's own Playwright build; on Windows
// npx is a script, which only a shell starts. A session opened with --cdp-port <port> needs
// EXPLORE_CDP_PORT=<port> in the environment Claude Code starts its servers with.

import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { DEFAULT_CDP_PORT } from './lib/explore-session.mjs';

export const SERVER = '@playwright/mcp@0.0.83';

/** The arguments of npx for the server, attached to `port`. */
export function serverArgs(port = DEFAULT_CDP_PORT) {
  return ['-y', SERVER, '--cdp-endpoint', `http://127.0.0.1:${port}`];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.EXPLORE_CDP_PORT || DEFAULT_CDP_PORT);
  const child = spawn('npx', serverArgs(port), {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  child.on('error', (error) => {
    process.stderr.write(`explore-browser: ${error.message}\n`);
    process.exit(1);
  });
}
