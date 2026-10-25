---
name: qa-publish
description: >-
  Phase 3 of UI test work. Sends the definitions of a pack's automated cases to the configured
  test-management tool through its adapter (npm run tm:manifest, then tm:publish), checks them by
  read-back and moves the registry rows to published. Use when the user wants cases published,
  synced or pushed to the test-management tool. Expects the specs to exist and to have run in
  phase 2. Does not design, edit specs or report a run's results.
---

# qa-publish: publish the definitions

**Mode: design** (`.claude/rules/modes.md`). It writes case definitions to the tool, never results.

## Inputs

- qa-config `test_management.provider` and the variables its options name
  ([test management](../../../docs/test-management.md)), and `.claude/rules/reporting.md`.
- The registries' `automated` rows and the latest run of their specs.

## Steps

1. **Check reachability** of the tool (`.claude/rules/reachability.md`).
2. **Build the manifest**: `npm run tm:manifest -- --pack <pack>`. Read what it excludes: each
   result without an identity comes with its reason. Fix the identity in the spec, never in the
   manifest.
3. **Dry run**: `npm run tm:publish -- --pack <pack> --dry-run` lists what would be sent and what is
   held back (draft, approved and blocked rows, spec tests no registry lists), with the reason for
   each.
4. **Gate.** Show the dry run and wait for approval. Confirm that no case id changed since the last
   publish: a changed id makes a second definition beside the old one.
5. **Publish**: `npm run tm:publish -- --pack <pack>`. The adapter reads every write back. A tool
   that keeps no definitions (`allure-report`) skips the phase with a notice; its cases appear with
   the next reported run, so hand off to `qa-run` and come back for step 6 with
   `reports/tm/report-<provider>.json`.
6. **Record**: rows the read-back confirmed move to `published`. Their feature code is frozen from
   now on.
7. **Hand off** to `qa-run` with the published identities and their links from
   `reports/tm/publish-<provider>.json`.

## If it stops halfway

Publishing is idempotent per identity: run it again and the cases already sent come back unchanged.
Move only the rows the read-back confirmed. A definition whose identity no registry row has any more
is listed and left alone; ask whether to remove it in the tool or bring the row back.

## Do not

- Publish drafts or blocked cases, or to a tool or project other than the configured one.
- Edit definitions by hand in the tool: the next publish writes them again from the specs.
- Print a token.
