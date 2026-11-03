---
name: qa-intake
description: >-
  Phase 0 of UI test work. Reads a feature of a web application from its app map, the live pages
  (read-only, plus the pack's login), a story or issue and optional manual exploration notes, and
  writes the feature contract apps/<pack>/docs/features/<feature>.md with its business rules,
  states, responsive differences and the seven quality dimensions. Use when the user asks to start
  testing a feature or a set of routes, to "intake" something, or names routes of a pack that have
  no contract yet. Ends at a review gate; designing cases, writing specs and publishing belong to
  later phases.
---

# qa-intake: write the feature contract

**Mode: design** (`.claude/rules/modes.md`). Navigate and read, sign in through the pack's login
with an account that is there before the session; never submit another form or create an account.

## Inputs

- The pack (`.claude/rules/app-packs.md`), its skill `.claude/skills/<pack>-ui/SKILL.md` and its
  `docs/app-notes.md`.
- The app map `apps/<pack>/docs/app-map.json`, and `app-map.<role>.json` per signed-in role:
  routes, landmarks, the summarized accessibility tree, forms with their HTML constraints, the
  endpoints each page calls.
- Optional: a story or issue (`npm run tracker -- get <KEY>`), an intake request written from
  [the intake template](../../../docs/templates/intake.md), manual exploration notes.

## Steps

1. **Pin the scope.** List the routes and the user goal they serve. Every route must be in the app
   map or answer live; a route the application does not have is reported and the work stops there.
   Never swap in a page that looks similar.
2. **Check reachability** (`.claude/rules/reachability.md`). Juice Shop down means
   `npm run juice-shop:up`; anything else that does not answer means stopping with what to check.
3. **Refresh the map when it is stale or misses a route**:
   `npm run app:map -- --pack <pack> --write`, and with `--actor <role>` for the signed-in routes
   (`docs/app-map.<role>.json`), which walks with the state an actor fixture wrote during a spec
   run. `npm run app:map:check`, with the same `--actor`, shows what changed since the tracked copy
   (what counts is `scripts/lib/app-map-drift.mjs`); `npm run app:drift` checks every pack of the
   environment, and runs weekly in CI.
4. **Read the pages.** For each route take, from the map and from the live page through a browser
   tool: the elements by role and accessible name, the form constraints (`required`, `maxlength`,
   `pattern`, `type`), what each state shows (empty, loading, error, success) where reading can
   reach it, the calls the page makes, and what changes at each breakpoint of `app.json`. A state
   that only a submitted form or a write reaches is marked **unobserved**; when it matters before
   design, propose a spec or an execution run that creates its own data, and write what it showed
   back here.
5. **Take every source in turn**: the story, the intake request, the exploration notes. Each claim
   is compared with the live page before it enters the contract. A claim the page contradicts is a
   gap; one nobody can check yet goes to the assumptions. A disagreement that needs more than a
   quick look (several roles, devices or routes) goes to a
   [`behaviour-investigator`](../../agents/behaviour-investigator.md), one question per launch; its
   report is evidence for the contract, not a decision.
6. **Search the tracker for each gap** as it is written (`npm run tracker -- search <words>`, with
   the route and the text seen), and record the key or "searched, none". `qa-report-bug` decides
   whether a gap is filed.
7. **Write the contract** from [the template](../../../docs/templates/feature-contract.md). Settle
   the feature code with the user before the first contract of a feature
   (`.claude/rules/registry.md`). Each business rule gets an id `REQ-<FEATURE>-NN` and the source
   that stated it; a rule that will not be tested goes to out of scope with the reason. Work through
   the quality-dimensions checklist: `applies`, or `n/a` with a reason a reviewer could dispute.
   Link the contract from the pack README, and add facts about the application that tests will rely
   on to `docs/app-notes.md`.
8. **Check**: `npm run lint:suite` (the `contract-shape` rule reads the business rules table) and
   `npm run lint:docs`.
9. **Review gate.** Show the contract, its gaps with their tracker searches, the unobserved states
   and the assumptions to confirm, and wait for approval. An open question is never closed by a
   guess.
10. **Hand off** to `qa-design` with the routes, the rule count, the dimensions that apply and the
    file path.

## If it stops halfway

Nothing was written to the application, so the only state is the draft contract: keep it with
"Draft" at the top, or delete it if the feature is dropped. Throwaway scripts in the scratchpad go
too.

## Do not

- Type into a form other than the login, press a submit button, accept a dialog that changes data,
  or sign up, in the browser tools or in a script.
- Design cases, write specs or call the test-management tool.
- File issues. Write real names, accounts, addresses or credentials into the contract.
