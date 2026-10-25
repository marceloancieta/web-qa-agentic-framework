---
name: qa-automate
description: >-
  Phase 2 of UI test work. Turns the approved cases of a registry into Playwright specs under
  apps/<pack>/specs/, building the page objects, components, flows, builders and mocks they need
  first, with locators captured from the live page (read-only). Checks them with the type, lint and
  QA linters, runs them on every device project of the environment twice, writes visual baselines
  only through the visual lane, and moves the rows to automated. Use when the user asks to automate,
  implement or write the specs of approved cases. Does not publish or report runs.
---

# qa-automate: write and prove the specs

**Mode: design** (`.claude/rules/modes.md`). Running the specs being written is allowed; their
writes go to data they create, in an environment whose entry for the pack has `allow_writes` true.

## Inputs

- The registry `apps/<pack>/registry/<feature>.md`, `approved` rows only, and its contract.
- `.claude/rules/generation.md` (layers, locators, the shape of a case, data) and
  `.claude/rules/tagging.md`.
- `apps/juice-shop/` as the worked example, and the pack's existing pages, components, flows,
  builders and mocks.

## Steps

1. **Capture the locators live**, read-only: open each route with a browser tool or read its
   accessibility tree in the app map, and take the role and accessible name the page really has. Use
   the order of the generation rule. An element with no accessible name is an accessibility finding
   for `qa-report-bug`, not a reason for CSS.
2. **Build the blocks first**, in the conversation: page objects and components (locate and act,
   never assert; masks for the visual check), builders for data, `api/` clients for arranging and
   verifying state, mocks by name over `helpers/network.ts`, a flow when two specs share a task.
   A spec never builds a locator, sends a request or routes the network itself (`lint-layers`).
3. **Write the specs**: one test per approved case, titled with the id, the title and exactly the
   registry's Tags cell. Arrange through actors and `api/`, act through pages, assert with
   web-first assertions on what the case created. A case the registry maps to an open issue arms
   `test.fail(true, await knownGap('<KEY>', why))` right before the action and carries
   `@known-gap`. A `@destructive` case goes in a spec file of its own and ends with its recovery.
4. **Check offline**:
   ```sh
   npm run types:check
   npm run lint
   npm run lint:qa
   npx playwright test apps/<pack>/specs/<file> --list
   ```
   Every approved case of the file appears once per device project, except the `@visual`,
   `@destructive` and `@quarantine` ones, which only their lanes select.
5. **Run** the new specs on every device project of the environment, twice:
   `npx playwright test apps/<pack>/specs/<file> --repeat-each=2`. Each case passes, or fails as an
   armed known gap; a precondition the environment does not meet skips with its reason. Anything
   else is a test error to fix, or a finding for `qa-report-bug`. A spec that passes only sometimes
   is not done.
6. **Visual cases**: write or rewrite the baselines with
   `npm run lanes:visual -- --phase automate --update`, then run `npm run lanes:visual` to compare.
   The lane runs in the pinned container (ADR 0009). Look at every new or changed baseline image
   before the gate.
7. **Review each spec against its case** before the gate: the title against the body, each
   assertion able to fail, no fixed waits, no assertion in a branch, locators in the right order,
   the layers kept. Fix what the review finds and run again.
8. **Record**: each automated row moves to `automated` with its Spec column filled.
   `npm run lint:suite` and `npm run coverage:status` must not report the feature.
9. **Review gate.** Show the spec files, the run summary (passed, failed as armed, skipped with
   reasons, per device), the new or changed baseline images, data the run could not clean up and the
   registry diff. Then wait until the user approves.
10. **Hand off** to `qa-publish`.

## If it stops halfway

- A row moves to `automated` only when its spec exists, ran as designed and passed review. Never
  mark ahead of the code.
- A spec that cannot be finished is removed before the gate and its row stays `approved`. A
  `test.fixme` is a working state, never a commit.
- Data the run created and could not remove is listed in the summary with how to remove it.

## Do not

- Automate a `draft` case, or change what a case means while coding it; send it back to `qa-design`.
- Update baselines with `--update-snapshots` or outside the visual lane.
- Publish, report runs or edit case definitions in the test-management tool.
- Write an email, a password or a real name into a spec; builders and placeholders only.
