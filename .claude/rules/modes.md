# Modes: design and execution never mix

Work on an application happens in one of two modes. A request that needs both, such as "design the
login cases and run them", is split in two. The first mode finishes and shows its result at its gate,
and only then does the second start.

| | Design | Execution |
|---|---|---|
| Phases | intake, design, automate, publish (`qa-intake`, `qa-design`, `qa-automate`, `qa-publish`) | run (`qa-run`) |
| May do in the application | navigate and read: open routes, follow links, read the accessibility tree, `npm run app:map`; sign in through the pack's login; run the specs being built, which create their own data | run the suite as written, and the lanes within their own write rules |
| May write files | feature contracts, registries, specs, pages, components, flows, mocks, builders, pack docs, visual baselines (automate only) | run reports only |
| Test management | publish case definitions | report the results of a run |
| Never | submit a form, sign up or change data outside a spec run; report a run's results | edit a spec, a registry, a contract, a case definition or a baseline because of what a run showed |

Why:

- **Design leaves the application as it found it.** A submitted form or a new account changes
  shared state, and nothing in the design phase cleans it up. When a write's behaviour must be seen,
  a spec does it, with data it creates, or an execution run does, and what it showed goes into the
  contract before design continues.
- **Execution never changes definitions.** A run that edits the spec, the registry or the baseline
  it just compared against turns a failure into a pass that nobody reviewed. A failing run produces a
  report, and the report can lead to a design change, a defect or a known gap, each through its own
  phase.
- **Visual baselines are design.** Only the automate phase rewrites them
  (`npm run lanes:visual -- --phase automate --update`), and the diff images are shown at its gate.
  The visual lane refuses `--update-snapshots` in a run (ADR 0009).
- **Reporting a defect** (`qa-report-bug`) can follow either mode. It writes to the tracker, never
  to the application.

## What counts as reading

- **The pack's login is allowed in design.** Signing in sends a write-shaped request but changes no
  data the cases depend on, the way the credential exchange of an API does. It uses an account that
  is there before the session: one named by the pack's actor configuration and read from the
  environment, or the browser state an actor fixture wrote during a spec run
  (`npm run app:map -- --pack <pack> --actor <role>` finds it by role). Design never creates an
  account to look around.
- **The app map is read-only by construction.** It aborts every request that is not `GET`, `HEAD` or
  `OPTIONS`, never clicks, types or submits, and lists what it blocked under `blocked_writes`.
- **Browser tools follow the same limits.** In design, a browser driven by an agent (Playwright MCP,
  Claude in Chrome) navigates, reads and takes screenshots. It does not type into a form other than
  the login, press a submit button or accept a dialog that changes data.
- **Manual exploration notes** that someone else wrote are a source for intake like a story or an
  issue. They do not make a write in design acceptable.

## Gates

Every phase ends at a **review gate**: its skill shows what it produced and waits for approval
before the next phase starts. A gate is skipped only when the user says so for that step. An agent
never holds a gate; approvals happen in the conversation.
