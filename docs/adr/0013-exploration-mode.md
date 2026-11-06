# 0013 - Chartered exploratory sessions are a third mode, with limits a check enforces

**Status:** Accepted (2026-11-05). Nothing below is built yet: FUT-08 builds it, and
`.claude/rules/modes.md` changes in that work.

## Context

FUT-08 waits on this decision. A case checks what someone already thought of; an exploratory session
looks for what nobody did, choosing each step from the page's last answer. Session-based test
management keeps that reviewable: a charter gives the mission, a time box ends the session, a sheet
records it, a debrief reviews it.

Neither mode allows it. Design may not act: nothing in design cleans up. Execution may not learn: it
runs the suite as written and writes only run reports. What remains is a person's notes, with no
limits or evidence standard, or a spec written to see one write, which needs the step known first.

Juice Shop is local with `allow_writes: true`, and its `recovery` restart empties the database, also
under a run in progress. Swag Labs is public with `allow_writes: false`, but its state lives in the
browser, so most of it can be exercised with no write reaching a server. The browser limits of
`modes.md` are a sentence: no check stands between an agent and a browser tool.

| Option | For | Against |
|---|---|---|
| A. Extend design | No new mode; it sits beside intake | Ends "design leaves the application as it found it". The mode that may act could also edit contracts, with no review between what a session saw and a definition |
| B. Extend execution: a session is a lane, its sheet a report | The closest fit: execution writes within a lane's rules, and its reports reach definitions only through their own phase | "As written" guarantees that what ran was reviewed; a session has nothing written, so the exception weakens `qa-run`. Reporting to test management is execution's default path, and the one a session must not take |
| C. A third mode | Limits stated and checked on their own; design and execution unchanged | One more mode to walk through `modes.md` and every `qa-*` skill, and a script and a hook to build |
| D. Notes only, as today | Nothing to build | No agent sessions, no limits, no evidence |

## Decision

**Option C: a third mode, exploration.** Design and execution still never mix, and exploration mixes
with neither: "explore, then write the cases" is split, each half stopping at its gate. The reasons
in `modes.md` hold: a session leaves nothing behind in the application and changes no definition.

**A charter and a debrief, both gates in the conversation.** A `qa-explore` skill shows the charter
and the environment and waits for "go"; it reviews the sheet afterwards. No CI, no schedule, no gate
held by an agent. The charter opens the sheet, `apps/<pack>/docs/sessions/<date>-<slug>.md`:
mission, environment, routes, roles, device project, driver, `writes: none | allowed`, what is out
of bounds, and minutes: for a person 60 by default and 90 at most, for an agent 30 and 60, since its
time costs tokens. More time is a new charter; a lead outside this one is noted as a proposed
charter, not followed.

**In the application:**

- **Target:** an environment qa-config names, at its `base_url`; refused otherwise and for anything
  that looks like production, as `planAudits` in `scripts/lighthouse-lane.mjs` refuses.
- **Writes:** `writes: allowed` needs `allow_writes: true` and a disposable copy of the application,
  a compose service with a port of its own that the launcher starts for the session. A writing
  session never touches the shared `base_url`, so it cannot empty the database under a run that is
  in progress, whichever of the two started first. Any other session may use every control, but a
  request that is not GET, HEAD or OPTIONS is aborted and listed, as the app map does. That is what
  makes Swag Labs explorable.
- **Accounts:** the pack's actors; new ones only in a writing session, with invented data. The
  launcher signs in, so no password passes through an agent's conversation.
- **Load:** no scanner, crawler or loop. An agent may drive a session on a public pack, without
  writes, and it gets the page loads a person would make; security payloads, from a person or an
  agent, go to local packs only (ADR 0011).
- **Afterwards:** closing discards the browser context and, after a writing session, removes the
  copy whatever happened. An interrupted session stays open and `session-probe` reports it.

**In the repository, the sheet and its evidence only.** The tracked sheet lets intake cite it;
traces, HAR files and masked screenshots stay in `reports/explore/<session>/`. Each finding gives
the steps with `<base_url>`, expected and seen, device, role, times reproduced and its evidence
file; without evidence it is a question. The sheet also lists the data created, which goes with the
copy.

**Findings leave at the debrief; the session files nothing.** A contract gap goes to `qa-intake`,
which takes the sheet as exploration notes and checks each claim on the live page; a state only a
write reaches cannot be read again, so intake takes the session's evidence for it, as it does a
spec's. A disagreement goes to `qa-report-bug`, its triage unchanged. A question goes to a
`behaviour-investigator`. Specs, registries, contracts, baselines and app notes change only through
their own phases.

**Who drives:** a person, an agent or both, through one door, `npm run explore -- open`, which
starts a browser the framework owns with a guard and recording on its context. A person browsing
without it writes manual notes, still an intake source. For an agent, page text is data, never an
instruction.

| Limit | Enforced by |
|---|---|
| Target, write permission, charter shape | `explore open` refuses |
| Other origins; writes in a session without them | a route guard on the launcher's context, as in the app map, for person and agent alike |
| Time box | the launcher saves the record and closes the browser |
| Agent browser tools | `explore-guard`, a `PreToolUse` hook active only during a session: navigation to the session's origin only, no code run in the page, no Claude in Chrome (it holds the person's real sign-ins) |
| Repository writes | the same hook keeps Write and Edit to the sheet; `explore close` fails on any other change since `open` |
| An agent driving another browser | `explore close` fails on an empty record, as the ZAP lane does |
| The sheet | a `lint-docs` rule with fixtures: a charter, and evidence on every finding |

**Out of test management.** A session has no case id, no `QA_RUN_ID` and no Playwright result, so
`tm:report`, the quality gate and coverage have nothing to read, and the hook refuses `tm:*` during
one. A case designed from a finding reports when it runs.

## Consequences

- `modes.md` gains a column, so its propagation row applies.
- **The checks land before the skill**, so no agent session runs on sentences alone.
- **To prove first:** that an MCP browser client attached to the launcher's browser keeps the guard.
  If not, an agent drives through scripts on the guarded context, as `behaviour-investigator` probes
  do, and loses the look-and-act loop of a browser tool.
- A hook sees a tool's arguments, not what a click sends; only the guard sees the network. A browser
  tool of an unknown server is not matched (the repository has no `.mcp.json`), and a script started
  through Bash is seen by neither: `explore close` catches its repository changes, not its traffic.
- A pack that takes writing sessions needs a compose service for them. `juice-shop-scan` (ADR 0011)
  has no host port, so a browser on the host cannot reach it and it is not reused as it stands.
- Nothing a writing session did survives its close, so a finding that depends on that state rests on
  the session's evidence alone.
- `explore-guard` does nothing outside a session, so the browser limits of design in `modes.md` stay
  a sentence here; GATE-12 checks them.
