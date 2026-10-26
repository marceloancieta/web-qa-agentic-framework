---
paths:
  - 'apps/**/specs/**'
  - 'helpers/case-meta.ts'
  - 'helpers/evidence.ts'
  - 'scripts/tm/**'
  - 'docs/test-management.md'
---

# Reporting

What every result carries, whichever test-management tool receives it. Tools are reached through
adapters ([test management](../../docs/test-management.md), ADR 0010), so nothing here names a
vendor.

## Identity first

- A designed case's title starts with its id, and `applyCaseMeta` gives the result the identity
  `<pack>-<version>-<TC id>`. Adapters match on that identity only; never join results to cases by
  title, file or line.
- A case runs on every device project of the environment and is reported once, with the worst status
  of its devices and each device's status beside it.
- Results without an identity (a test with no case id, a test that never started) are listed with a
  reason under `excluded` in the manifest, never dropped quietly.

## What a result holds

| Part | Comes from |
|---|---|
| Suite tree | the pack's title and version, set by the core fixture |
| Device | the project's `device` label |
| Tags | the title and `{ tag }` (`.claude/rules/tagging.md`) |
| Evidence | the trace, screenshots with sensitive fields masked, the axe result of an accessibility check, the diff images of a visual check; attached through `helpers/evidence.ts`, redacted; what Playwright writes on its own (the failure context, the trace) is redacted of the run's known secrets after the run by `helpers/redact-reporter.ts` |
| Issue link | `knownGap(key, why)` for a known gap |
| Run id | the `run` label (`QA_RUN_ID`), shared with `tm:report` |

A failure whose only evidence is "element not found" is incomplete: the trace and a screenshot of
the state the page was in are what make it reviewable.

## Runs

- One test run is one run in the tool: `npm run tm:report` starts it, reports the latest results and
  closes it even when reporting failed.
- `npm run tm:publish` sends only `automated` and `published` cases; `--case <id>` repairs one case
  without touching the others.
- Do not pass `--reporter` to Playwright; it replaces the configured reporters. Add a JSON or JUnit report
  through `QA_JSON_REPORT` or `QA_JUNIT_REPORT`.
- Every write to the tool or the tracker is read back by the adapter. A publish or report that says
  it worked without a read-back is not trusted.
- A known gap shows as `failed` with its issue link while the issue is open, and as `passed` with
  `knownGap: closed` once it is fixed, which means the arm and the tag must go.
