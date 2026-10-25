# 0009 - The visual lane runs in one pinned Playwright image

**Status:** Accepted (2026-10-24)

## Context

A screenshot depends on more than the page: the browser build, the fonts installed, the font
renderer and its anti-aliasing. The same page rendered on Windows, macOS and a Linux CI agent
differs in thousands of pixels, so baselines kept per operating system multiply the files to review
and still fail when an agent's fonts change. A visual check is only trustworthy when the baseline and
the comparison come from the same rendering environment.

Updating baselines is also a judgement: a new screenshot replaces the expected result. Done in the
middle of a run, it turns every visual failure into a pass.

## Decision

- **One image.** The visual lane runs only inside the official Playwright image, pinned by digest
  in `docker/compose.yml` (service `playwright`, profile `lanes`). A unit test fails when the image
  version is not the `@playwright/test` version of the repository.
- **Refused elsewhere.** `scripts/visual-lane.mjs` refuses to run unless the compose service started
  it (`QA_IN_PLAYWRIGHT_IMAGE=1`) and says how to run it: `npm run lanes:visual`. Every other run
  leaves `@visual` cases out (`scripts/lib/tags.mjs`), so a run on a laptop never compares anything.
- **One set of baselines.** `apps/<pack>/visual/<project>/<spec>/<name>.png`, with no OS suffix
  (`snapshotPathTemplate` in `playwright.config.ts`).
- **Updates are design.** `--update` is accepted only with `--phase automate`; in the run phase it
  is refused, and so is Playwright's own `--update-snapshots`. The automate phase shows the new
  images at its review gate before they are committed.
- **Stable renders.** Animations and the caret are off, page objects mask dynamic regions, and a
  pack can hide volatile parts with a stylesheet and set its own tolerance (`app.json` `visual`).
  Whatever the application varies by itself (a banner, a notification) is settled by the pack's
  context preparation, not by a wider tolerance.
- **Reaching the applications.** Packs whose base URL is a host address are reached through
  `host.docker.internal`, which the service maps to the host on every platform.

## Consequences

- Docker is needed for the visual lane; nothing else in the suite needs it beyond the local packs.
- Moving to a new Playwright version means a new pinned image and new baselines in one change.
- The quality gate counts failed `@visual` cases against `quality_gate.visual`.
