# 0010 - Test management and trackers behind adapters

**Status:** Accepted (2026-10-25)

## Context

Teams use different test-management tools and issue trackers, and the tools differ in model: most
test-management tools hold case definitions before any run, some only build cases from results. An
interface designed around one tool takes that tool's shape without anyone deciding it. A UI suite
adds two questions an API suite does not have: one case runs on several device projects, and a known
defect kept red on purpose shows up as a pass.

## Decision

**A neutral manifest and one adapter per tool.** `scripts/tm/manifest.mjs` joins the registries, the
specs and the latest Allure results into one shape that belongs to no tool; an adapter under
`scripts/tm/adapters/<tool>` (selected by qa-config `test_management.provider`) publishes
definitions and reports runs. The interface is in the header of `scripts/tm/adapter.mjs`:
capabilities, publish, start, report, close, and the read-back methods that verify every write.
Trackers follow the same pattern in `scripts/tracker` (`local`, `github`, `jira`).

- **Identity is the case id**, never the title: `<pack>-<version>-<TC id>`, written into the
  results by the core's automatic `caseMeta` fixture (`helpers/case-meta.ts`). Renaming a title
  does not orphan a published case.
- **Only proven cases are published**: registry status `automated` or `published`. A result that
  cannot be attributed to a case is listed with its reason, never dropped.
- **Scoped writes**: `--case <id>` limits publish and report to the named cases, so repairing one
  case's metadata never touches the others; an id that matches no case is refused.
- **Devices**: a case reported once per run takes the worst status of its device projects, and the
  result lists each device's status. A failure on mobile is never hidden by a pass on desktop.
- **Known gaps** are armed with `test.fail(true, await knownGap(key, why))` and tagged
  `@known-gap`, so the suite stays green while the defect is open and fails when it is fixed. Test
  management records the product, not the suite: the manifest reports an open gap as `failed` with
  its issue link, and a fixed one as `passed` with `knownGap: closed`, so the arm is removed.

Adapters: `local` (JSON files, definitions first: the reference implementation the contract tests
run against with no external service), `allure-report` (no definitions: the publish phase is
skipped with a notice) and `allure-testops`. TestRail is documented only.

## Consequences

- Adding a tool means one adapter that passes `describeAdapterContract` in `scripts/tm/contract.mjs`.
- Credentials come only from the variables qa-config names; no adapter takes a token as a flag.
- The quality gate keeps counting known gaps as the suite sees them (expected failures pass); the
  test-management record and the gate can differ on purpose.
