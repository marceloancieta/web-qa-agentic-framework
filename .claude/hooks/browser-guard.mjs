#!/usr/bin/env node
// Holds an agent's browser tools (Playwright MCP, Claude in Chrome) to the browser limits of design in
// .claude/rules/modes.md: navigate and read the environments qa-config names, type only into the
// pack's login, submit nothing.
//
//   allow  a call that only reads: snapshots, screenshots, console and network reads, hovering,
//          scrolling, keys that move focus, navigation to a base URL qa-config names.
//   ask    a call whose effect depends on the page: clicks, typing, selecting, keys that activate,
//          accepting a dialog, code run in the page, navigation outside the named environments.
//   deny   a file upload, which design never makes.
//
// Execution never drives an agent browser (qa-run runs the suite as written), so the hook applies in
// every session. A browser tool of another server is not matched; see ./README.md.

import { allow, decide, projectDir, readPayload } from './lib/io.mjs';
import { configuredOrigins, loadConfig } from './lib/config.mjs';
import { browserVerdict } from './lib/browser.mjs';

const payload = readPayload();
if (!payload || payload.hook_event_name !== 'PreToolUse') allow();

const origins = configuredOrigins(loadConfig(projectDir(payload)).config);
const verdict = browserVerdict(payload.tool_name, payload.tool_input ?? {}, origins);
if (!verdict || verdict.decision === 'allow') allow();

decide(
  verdict.decision,
  `browser-guard (.claude/rules/modes.md, design): the call ${verdict.reason}.`,
);
