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
     retries, then the failed repetitions per case;
   - `npm run lanes:zap -- --pack <pack>`: a ZAP baseline scan of a local pack, judged against its
     `zap-known.json`. It scans a disposable copy of the application that it starts and removes
     (`<pack>-scan` in `docker/compose.yml`), never the one the other lanes use, so it may run
     beside them; it refuses a pack whose base URL is not on this machine.
   - `npm run lanes:web-vitals`: the `@web-vitals` tests on one worker, medians of LCP, CLS and INP
     against the environment's budget; `npm run lanes:lighthouse`: Lighthouse scores of the routes
     qa-config lists, reported in `reports/lighthouse/` only (ADR 0012).

   Every run also sweeps the security headers of each pack's documents (`specs/security/`,
   `@security`) against its `headers-known.json`; a new gap fails like a new violation.

   The lanes other than the visual and Lighthouse ones are `scripts/lanes.mjs`; a lane with no case says so and
   runs nothing. If `--list` shows no test, say so and stop; never widen the selection on your own. `@visual`, `@destructive`, `@quarantine`,
   `@a11y-sweep` and `@web-vitals` tests are excluded from the device projects, and `@desktop-only`,
   `@mobile-only` and `@not-webkit` cases from the projects they do not apply to (`projectTagFilter`
   in `scripts/lib/tags.mjs`); report them as left out, never as missing.
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
   - data the run created and did not remove;
   - the cited keys whose issue is closed or unknown (`npm run cited-status`, which reads the
     tracker and writes nothing; `.claude/rules/registry.md`). If the tracker does not answer, say
     so (`.claude/rules/reachability.md`) and leave this line out.
7. **Follow-ups are proposals**, not actions: a design change (`qa-design`), a defect
   (`qa-report-bug`), a flaky case, a known gap that started to pass (check that its issue is
   fixed before the arm and the tag go), or a closed or unknown cited key (`qa-design` revisits the
   case or the claim). When failures point at a page that changed,
   `npm run app:drift -- --pack <pack>` names the routes, roles, names and form constraints that
   differ from the tracked map; it only reads and writes under `reports/`, and rewriting the map is
   design work. When `qa-publish` sent this run for a tool without
   definitions, return to its step 6; this skill never moves a registry row.

## If it stops halfway

An interrupted run leaves partial results in `allure-results/`. Report what ran, and never report a
partial run to the tool as complete: name it as partial with `--name`.

## Do not

- Edit a spec, a registry, a contract, a definition or a baseline because of what a run showed.
- Run with `--update-snapshots`; the visual lane refuses it outside the automate phase.
- Run two selections at once into the same results folder.
- Print a token, or attach a screenshot or trace that was not redacted.
