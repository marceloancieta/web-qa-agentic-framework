# 0012 - Web vitals and Lighthouse run in lanes of their own, against budgets per environment

**Status:** Accepted (2026-11-03)

## Context

Perceived performance in v0.1 was checked through what a user sees: a loading indicator appears and
goes away. Two numbers-based checks were missing: the web vitals a browser reports for a page (LCP,
CLS, INP) and a Lighthouse audit. Both measure time, and time on a test machine is noisy: the same
local Juice Shop page gave an LCP from 1.3 s to 3 s between visits, and its Lighthouse mobile
performance score moved by 14 points between three audits. A timing check that runs beside the
suite's other workers measures their load as much as the page.

Not every engine can measure: LCP, layout shifts and event timing are PerformanceObserver entry
types that Chromium supports and WebKit and Firefox lack in part. And the numbers depend on where the
application runs (a local container, a CI runner, a public demo someone else hosts), so one budget
for every environment is either too loose locally or too tight in CI.

## Decision

**Budgets live in qa-config, per environment and pack** (`app.environments.<env>.packs.<pack>
.performance`, ADR 0008): measured numbers change with the place, which is what qa-config holds.
`web_vitals.budgets` has a `default` and an entry per device project for what differs on it (merged
over the default); `lighthouse` has the routes, the number of runs and the minimum score of each
category per form factor. A pack without them is skipped with the reason, never passed. The example
starts from the "good" thresholds of the Core Web Vitals (LCP 2.5 s, CLS 0.1, INP 200 ms), lowered
where a page measures far below them and raised for a device whose medians come close, and sets
the Lighthouse minimums below the scores it measured locally.

**Web vitals without a library.** A recorder added to the context before the page loads keeps the
browser's own entries; `helpers/web-vitals.ts` derives LCP (the last candidate before the first
input), CLS (the largest session window) and INP (the slowest interaction, one in fifty left out).
A pack's `@web-vitals` test hands the `vitals` fixture a visit in two parts: `load` opens a page
through its page objects and waits until it is ready, `interact` makes one interaction that changes
no data (opening a menu, clicking into a field). Between them the fixture waits until an LCP
candidate was reported and none followed for half a second: the first input ends LCP, and the
largest element can paint after the controls a visit waits for (on Swag Labs the largest text
paints some 150 ms after the Username field shows, and a click on that field left LCP unmeasured).
The fixture visits the page several times (`samples`, 5), each in a new context of the role, and judges
the medians. An engine that lacks an entry type skips the test, naming it; a visit that records no
interaction, or a budgeted metric that a visit did not measure, fails.

**Noise is handled, not hidden.** The web vitals lane runs on one worker, so no other browser shares
the CPU; each visit starts cold in its own context; the median of an odd number of visits is judged,
so one slow visit does not fail a page and a slower page does; every visit is attached as evidence.
Budgets are thresholds with room above what the page measures, not the measurement itself.

**Lighthouse drives Playwright's Chromium.** `scripts/lighthouse-lane.mjs` starts the Chromium the
suite already installs (its full build, new headless mode) with a debugging port and the pack's
`cookies`, and runs Lighthouse (a pinned dev dependency) through that port with its own emulation
and throttling per form factor, the pack's `third_party_hosts` blocked. A pinned container was the
alternative; it would add an image to maintain for scores that vary by hardware anyway. Each route
is audited `runs` times and the median score of each category is judged.

**Only hosts qa-config names, never production.** The Lighthouse lane audits the base URL of the
active environment's entry; a `QA_<PACK>_BASE_URL` pointing at another origin is refused, so is an
environment whose name starts with `prod`, and an audit that ends on another origin fails. Swag Labs
is a public demo run by a third party: its entry in the `local` example audits one route once on
desktop and times three visits of its login page, a handful of page loads a person would make; the
`ci` environment does not configure it, so CI never loads it.

**Weekly in CI, not on every change.** Both lanes run in the weekly and on-demand `performance` job
of the workflow and in the weekly Jenkins build, outside the required check. A budget is calibrated
on what that job reports on the runner before it gates a change; moving the web vitals lane into the
lane matrix is then one line.

## Consequences

- `npm run lanes:web-vitals` and `npm run lanes:lighthouse` run on any machine with the browsers
  installed; neither needs Docker beyond the local packs.
- The web vitals measure Chromium only; Firefox and WebKit projects report the skip and its reason.
- Mobile device projects emulate the viewport and input, not a phone's CPU; Lighthouse's mobile
  form factor adds its own throttling, so its scores are lower than the web vitals suggest.
- Lighthouse results are not Playwright results: they do not reach the quality gate or test
  management, only `reports/lighthouse/`.
