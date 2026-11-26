#!/usr/bin/env node
// Holds an agent to the limits of an exploratory session (ADR 0013) while one is open: the
// session's browser through the `explore-browser` server only, navigation to the session's origin,
// no code run in the page, repository writes to the sheet only, nothing reported to test
// management. Outside a session it refuses only the `explore-browser` tools, which have no browser
// to drive. The table is ./lib/explore.mjs; what it cannot see is in ./README.md.

import { allow, decide, projectDir, readPayload } from './lib/io.mjs';
import { exploreVerdict, openSession } from './lib/explore.mjs';

const payload = readPayload();
if (!payload || payload.hook_event_name !== 'PreToolUse') allow();

const root = projectDir(payload);
const verdict = exploreVerdict(
  payload.tool_name,
  payload.tool_input ?? {},
  openSession(root),
  root,
);
if (!verdict || verdict.decision === 'allow') allow();

decide(
  verdict.decision,
  `explore-guard (ADR 0013, exploratory session): the call ${verdict.reason}.`,
);
