# Feature contract template

The document the `qa-intake` skill writes for each feature, at
`apps/<pack>/docs/features/<feature>.md`. Design reads it, and the feature's registry names it in
its `contract` header. Copy everything below the line.

Every statement says where it came from: the app map, the story or issue, an intake request,
exploration notes, a read-only look at the live application (with the date), or an assumption marked
as one. A look at the live application outranks a document, and the contract says so where they
differ. Repro steps and notes write `<base_url>`, never an environment's host.

The **Business rules** table is read by the tools (`scripts/lib/contract.mjs`): keep its three
columns, one rule per row, ids `REQ-<FEATURE>-NN`. Every rule must be cited by at least one case of
a registry that names this contract (`npm run traceability`, `uncited-rule`).

---

# `<Feature title>` contract

| | |
|---|---|
| Pack and version | `<pack>` `<version from app.json>` |
| Feature code | `<FEATURE>` (case ids `TC-<FEATURE>-NN`) |
| Routes | `<route>`, one per line, as the app map writes them |
| Sources | the story or issue key, the intake request, exploration notes, the app map's date |
| Intake date | `<YYYY-MM-DD>` |

## Purpose

`As <a role>, I <do something on the page> so that <outcome>.`

## Business rules

| ID | Rule | Source |
|---|---|---|
| REQ-`<FEATURE>`-01 | one testable rule, as behaviour someone can watch | where it came from |

## Acceptance criteria

Each criterion as given, when, then, naming the rule ids it illustrates.

## Roles and entry state

The roles that use the feature (`anonymous`, roles from the pack's `actors` in qa-config) and the
state each case starts from. How that state is reached without the UI: the pack's `api/`, injected
storage, a mock.

## Elements

The elements the feature uses, by role and accessible name as the live page has them (the app map
lists them per route): `button "Log in"`, `textbox "Email"`. An element without an accessible name
is listed with how it can be found, and is also an accessibility finding.

## Validations

Per field: the HTML constraints the app map recorded (`required`, `type`, `maxlength`, `minlength`,
`pattern`, `min`, `max`) and what the page does beyond them (messages, when they appear, whether the
submit button is disabled). These are the partitions and boundaries design works from.

## States

What the page shows while loading, when empty, after an error and after success, and how a case can
reach each one: real data, a builder, a mock (`@mocked`).

## Navigation

Where the feature is reached from, where it leads, what Back, Forward, reload and a deep link do,
and what happens without a session on a route that needs one.

## Responsive differences

What changes between the device projects (the pack's `breakpoints` in `app.json`): a menu that
becomes a side navigation, a layout that stacks. A real difference in behaviour becomes a
`desktop-only` or `mobile-only` case with this section as its reason.

## Network dependencies

The calls the pages make (the app map's `api` per route), which answers the UI depends on, and which
of them a case can only produce with a mock (a `500`, a timeout, an empty list).

## Quality dimensions

One line per dimension: whether it applies to this feature and what is expected, or `n/a` with the
reason. The registry copies the verdicts into its `dimensions` header.

| Dimension | Applies? | Expected, or why not |
|---|---|---|
| responsive | `applies` or `n/a` | no horizontal scroll at any project; the layout at each breakpoint |
| perf | | loading indicators appear and go away; no flash of empty content |
| security | | `type=password` and `autocomplete`; generic errors; protected routes; logout and Back; nothing sensitive in the URL or storage; injected text shown as text |
| layout | | images load, no failed same-origin request, no console error; alignment through visual |
| navigation | | disabled and focused states; Back, Forward, reload, deep links; tabs |
| a11y | | axe at WCAG 2.1 AA against the baseline; keyboard order and visible focus; what a screen reader announces |
| content | | very long and boundary texts; empty values; overflow of user text |

## Measurements

What a read-only look at the live application showed, each with the route, the device and the date.

## Gaps and discrepancies

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | what differs or is unknown | where it was seen | the tracker key, or "searched, none" |

Search the tracker for each gap when you write it down, not later when you file it.

## Out of scope

What will not be tested, with the reason. A business rule that will not be tested moves here.

## Assumptions to confirm
