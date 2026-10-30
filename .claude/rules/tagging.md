---
paths:
  - 'apps/**/specs/**'
  - 'apps/*/registry/**'
  - 'scripts/lib/tags.mjs'
---

# Tagging

Tags select what a run includes (`--grep @smoke`, the lanes) and filter results in test management.
Allure copies every Playwright tag to the result, so a tag is written once: in the test title or in
`{ tag: [...] }`, on the test or on a describe around it.

The list lives in `scripts/lib/tags.mjs` and nowhere else. `lint-harness` reports a tag outside it
(unknown-tag) and a test without exactly one layer tag (layer-tag); `lint-suite` reports a test whose
tags differ from its registry case (tags-mismatch). To add a tag, change that file and this table in
the same commit.

## Layer: exactly one per case

| Tag | Applies when |
|---|---|
| `@smoke` | the case proves a critical path works: signing in, the main task of a feature |
| `@sanity` | the case proves a page loads and shows what it should, without exercising a rule |
| `@regression` | everything else: negatives, boundaries, states, security, accessibility, layout |

## Dimension: one per UI quality dimension the case covers

| Tag | Dimension | A case carries it when it checks |
|---|---|---|
| `@responsive` | responsiveness | a breakpoint's layout, no horizontal scroll, orientation |
| `@perf` | perceived performance | a loading indicator appears and goes away, no flash of empty content |
| `@security` | security in the UI | password fields, generic errors, protected routes, logout and Back, nothing sensitive in the URL or storage, injected text rendered as text |
| `@layout` | layout and design | alignment and overflow, broken images, the page health guard's findings as the subject of the case |
| `@navigation` | navigation and interaction | disabled and focused states, Back and Forward, deep links, reload, a session across tabs |
| `@a11y` | accessibility | axe against the baseline, keyboard order and focus, ARIA snapshots |
| `@content` | content handling | very long and boundary texts, empty values, overflow of user text |

A registry declares which dimensions apply, and each one that applies needs a case with its tag
(`.claude/rules/registry.md`).

## Handling: how a case runs or where it applies

| Tag | Meaning |
|---|---|
| `@visual` | compares screenshots; only the visual lane, in the pinned container, selects it |
| `@a11y-sweep` | a test of the accessibility sweep, one per route of the app maps and role (`helpers/a11y-sweep.ts`), not a designed case; only the a11y lane (`QA_A11Y_SWEEP=1`) selects it |
| `@i18n` | depends on a locale project (v0.2) |
| `@mocked` | the answer the case depends on comes from a mock; traceability refuses a requirement covered only by such cases |
| `@known-gap` | armed with `knownGap(key, why)` because an open issue keeps it red |
| `@quarantine` | confirmed flaky; every run leaves it out except the flake lane, until the linked fix lands |
| `@destructive` | leaves the application unusable for other cases until its recovery runs; it lives in a spec file of its own (`lint-harness` destructive-isolation) and only the destructive lane selects it |
| `@desktop-only`, `@mobile-only` | a real difference in behaviour; the other form factor's projects leave it out, and the registry's Devices cell gives the reason |
| `@e2e` | a journey's case: it crosses features from end to end. Every case of a journey registry (`kind: journey`) carries it and no other case does (`lint-suite` journey-tag); `--grep @e2e` runs the journeys alone |

What each project and lane leaves out is computed in one place, `projectTagFilter` in
`scripts/lib/tags.mjs`.

## Rules of thumb

- **Severity does not choose the layer.** A critical negative is still `@regression`; its weight is
  the case's priority.
- **`@e2e` is not a layer.** A journey also carries one layer tag: `@smoke` when it walks the
  critical path the product exists for, `@regression` otherwise.
- **Tags describe the code as written**, whatever the registry once planned. A case that does not
  check the keyboard is not `@a11y` because the page is accessible.
- **`@known-gap` and the arm go together.** The tag without `knownGap()` in the body, or the arm
  without the tag, leaves the result and the registry telling different stories.
- **`@destructive` names its recovery.** The case says how the application gets back to a usable
  state, and the pack's entry in qa-config has the `recovery` command the lane runs after it.
- **A workaround names its exit.** Code that compensates for a defect of the application says which
  issue it waits for and the condition that lets it go: "until `<KEY>` is fixed".
