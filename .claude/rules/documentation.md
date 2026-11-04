---
paths:
  - '**/*.md'
  - 'scripts/**'
  - '.claude/**'
---

# Documentation

Documentation drifts from the repository in predictable ways: a fact is copied and only one copy is
corrected, a new file is never linked, a number is typed by hand, a policy changes while the code
that applies it does not. `npm run lint:docs` catches what can be checked mechanically; this rule
covers the rest.

## One home per fact

Each fact has one owner. Other files link to it or name it; they never restate it.

| Fact | Owner |
|---|---|
| Design versus execution | `.claude/rules/modes.md` |
| The registry format: header keys, columns, statuses, techniques, priorities | `scripts/lib/registry.mjs`; meaning in `.claude/rules/registry.md` |
| The decision table format | `scripts/lib/decision-table.mjs` |
| The business rules table of a contract | `scripts/lib/contract.mjs`; the rest of the contract in `docs/templates/feature-contract.md` |
| The tag taxonomy and what each project leaves out | `scripts/lib/tags.mjs`; meaning in `.claude/rules/tagging.md` |
| The UI quality dimensions | `scripts/lib/tags.mjs` `DIMENSIONS`; meaning in architecture section 6b |
| Case identity | `helpers/case-meta.ts` (`caseIdentity`) |
| The locator order | ADR 0007; applied in `.claude/rules/generation.md` and `lint-harness` |
| The layers | ADR 0005; checked by `lint-layers` |
| What an application shows | `apps/<pack>/docs/app-map.json`, and `app-map.<role>.json` signed in (`npm run app:map`) |
| What counts as drift of an app map | `scripts/lib/app-map-drift.mjs` (`npm run app:drift`) |
| Cookies every context of a pack starts with | `apps/<pack>/app.json` `cookies` |
| Where an application departs from what it shows | `apps/<pack>/docs/app-notes.md` |
| The security header and cookie rules | `helpers/security-headers.ts`; the decision in ADR 0011 |
| Which packs the ZAP lane may scan, and that it scans only their disposable copy | `targetProblem` and `scanServiceOf` in `scripts/zap-lane.mjs` |
| Counts of cases by status and dimension | `npm run coverage:status` |
| Which requirements and rules are covered | `npm run traceability` |
| Whether the tracker keys the registries and contracts cite are still open | `npm run cited-status`; meaning in `.claude/rules/registry.md` |
| Quality gate thresholds | qa-config `quality_gate` |
| The device projects and the default set | `helpers/device-projects.json` (typed by `helpers/devices.ts`, read by `scripts/lib/devices.mjs`); each environment's `projects` in qa-config |
| What is built and what is next | `docs/backlog.md` |

A disagreement between two files about a fact this table does not list means the table needs a row.

## Working rules

1. **Link to the owner instead of copying.** If a value must appear elsewhere to be readable, make it
   the output of the owning script, not a copy typed by hand.
2. **Numbers and sets come from scripts.** A count or a list kept only in prose is never checked, so
   nobody notices when it goes wrong.
3. **Make every new file reachable in the commit that adds it:**
   - a doc under `docs/` or a pack's `docs/`: link it from a file that already has readers;
   - a rule: it loads by itself from `.claude/rules/`, and `CLAUDE.md` names the rules;
   - a skill: list it in `CLAUDE.md`;
   - an agent: list it in the agents table of `CLAUDE.md`, and name it in the skill that launches
     it (`scripts/__tests__/agent-guide.test.mjs` checks both);
   - a script: add it to `package.json`, and to `gates` if it is a check.
4. **Change a policy together with everything that applies it.** Walk the table below in the same
   commit.
5. **Statements about other systems carry their key** ("until `<KEY>` is fixed"), so whoever reads
   them later can check the issue. Statements about the past use the past tense.
6. **Backlog rows** keep one status from the backlog header. A finished row moves to **Done** with
   its closing commit, in the commit after the one that finished it. `lint-docs` closing-commit
   checks that every hash a **Done** row cites is a commit in the history of `HEAD`, so a history
   that is rewritten has to rewrite the hashes it cites.
7. **Public wording.** Describe what the framework does on its own terms. `lint-docs` public-wording
   reports phrases that present it as taken from another codebase, in files and commit messages.

## Propagation

| When this changes | Check these in the same commit |
|---|---|
| `.claude/rules/modes.md` | every `.claude/skills/qa-*/SKILL.md`, `AGENTS.md` (the process) |
| `.claude/rules/registry.md`, `scripts/lib/registry.mjs` or `scripts/lib/contract.mjs` | `docs/templates/registry.md`, `docs/templates/feature-contract.md`, `qa-design`, `qa-automate`, `qa-publish`, `lint-suite`, `traceability`, every pack registry |
| `scripts/lib/decision-table.mjs` | `qa-design`, `.claude/rules/generation.md`, `lint-suite`, every `apps/<pack>/rules/*.yaml` |
| `.claude/rules/tagging.md` or `scripts/lib/tags.mjs` | each other, `qa-automate`, `qa-run`, `playwright.config.ts`, `spec-author`, `ui-spec-reviewer` |
| `.claude/rules/generation.md` | `qa-automate`, `spec-author`, `ui-spec-reviewer`, `scripts/scaffold-app.mjs`, `apps/juice-shop/` as the worked example |
| `.claude/rules/reporting.md` | `helpers/case-meta.ts`, the adapters, `docs/test-management.md`, `qa-publish`, `qa-run` |
| a phase skill | `CLAUDE.md`, `AGENTS.md` (the process table), the skills before and after it |
| an agent in `.claude/agents/` | `CLAUDE.md` (the agents table), the skills that launch it, its evaluation fixtures if it has them || a template in `docs/templates/` | the skill that writes from it, and `scaffold-app` for the pack skill |
| `.githooks/`, or when the gates run | `AGENTS.md`, `CLAUDE.md` |
| a variable in `.env.example` or a qa-config key | `schemas/qa-config.schema.json`, `helpers/config.ts`, the docs that name it |

A linter sees statements that conflict, not updates that were never made, so this table is walked by
hand. Each missing pair found becomes a new row.
