---
name: qa-run
description: >-
  Phase 4 of UI test work. Runs a pack's suite, a tag selection or a lane against the configured
  environment on its device projects, and reports the results to the test-management tool
  (npx playwright test, then npm run tm:report), with a data gate before the run and every pass,
  failure and skip explained after it. Use when the user wants tests run for the first time or
  again, the smoke or the visual lane started, or results reported. Execution mode: never edits
  specs, registries, contracts, definitions or visual baselines.
---

# qa-run: run and report

**Mode: execution** (`.claude/rules/modes.md`). Run what exists and change nothing that defines it.

## Steps

1. **Pick the selection**: a pack (`--project='<pack>-*'`), a device of every pack
   (`--project='*-<device>'`), a tag (`--grep @smoke`, `--grep @e2e` for the journeys), named cases (`--grep "TC-LOGIN-0[1-3]"`), or
   a lane, which takes the same options after `--` (a `--grep` narrows the lane's tag):
   - `npm run lanes:visual`: the `@visual` cases, in the pinned container;
   - `npm run lanes:mocked`: the `@mocked` cases;
   - `npm run lanes:known-gap`: the `@known-gap` cases, then which gaps still fail as armed and
     which now pass;
   - `npm run lanes:destructive`: the `@destructive` cases on one worker, then the `recovery` of
     every pack it selected, whatever the run did. It writes: step 3 waits for "go";
   - `npm run lanes:flake -- --repeat <n>`: the `@quarantine` cases `n` times each (10), without
     retries, then the failed repetitions per case.

   The lanes other than the visual one are `scripts/lanes.mjs`; a lane with no case says so and
   runs nothing. If `--list` shows no test, say so and stop; never widen the selection on your own. `@visual`, `@destructive`, `@quarantine`
   and `@a11y-sweep` tests are excluded from the device projects (`projectTagFilter` in `scripts/lib/tags.mjs`);
   report them as left out, never as missing.
2. **Check the environment**: `QA_ENV`, the pack's entry in it (`base_url`, `allow_writes`, the
   variables its `actors` name) and reachability (`.claude/rules/reachability.md`). Never run
   against an environment the user did not choose.
3. **Data gate.** Say what data the selection needs and which cases will skip without it (the
   registry `test_data`, the skip reasons). For a selection that writes, show the environment and
   wait for "go".
4. **Run**: set `QA_RUN_ID` once, then `npx playwright test <selection>`, or the lane's script,
   with it; every step of the run (lanes, `tm:report`, the gate) uses the same id. Never pass
   `--reporter`. The JSON report the gate reads is written to `reports/playwright.json`, each
   lane's to `reports/lanes/<lane>.json`; `QA_JSON_REPORT` names another file, `QA_JUNIT_REPORT`
   adds JUnit. Each pack's `preflight-<pack>` project checks its configuration and its host first.
5. **Report**: `npm run tm:report -- --pack <pack>` with the same `QA_RUN_ID`. It lists the results
   it could not attribute, and closes the run even when reporting failed.
6. **Sum up**, in the language of the conversation:
   - each case once, with the worst status of its devices and each device beside it: passed, failed
     (with the assertion and the trace), failed as an armed known gap, or skipped with its reason;
   - the visual diffs and the new accessibility violations, against the quality gate
     (`npm run quality:gate`, with one `--report` per report of the run: the suite's and each
     lane's). The gate refuses a report of another run, or one older than the latest results;
     run the selection again rather than judge a report the run did not write;
   - the run link from `reports/tm/report-<provider>.json`;
   - definitions with no spec, and specs with no definition;
   - data the run created and did not remove.
7. **Follow-ups are proposals**, not actions: a design change (`qa-design`), a defect
   (`qa-report-bug`), a flaky case, or a known gap that started to pass (check that its issue is
   fixed before the arm and the tag go). When `qa-publish` sent this run for a tool without
   definitions, return to its step 6; this skill never moves a registry row.

## If it stops halfway

An interrupted run leaves partial results in `allure-results/`. Report what ran, and never report a
partial run to the tool as complete: name it as partial with `--name`.

## Do not

- Edit a spec, a registry, a contract, a definition or a baseline because of what a run showed.
- Run with `--update-snapshots`; the visual lane refuses it outside the automate phase.
- Run two selections at once into the same results folder.
- Print a token, or attach a screenshot or trace that was not redacted.
