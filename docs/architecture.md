# Architecture

The design of the framework: what it is for, the decisions taken and why, and how the parts fit.
Recorded decisions with alternatives live in [`adr/`](adr/README.md); the roadmap, the open work
and the acceptance criteria of each stage live in [`backlog.md`](backlog.md).

## Purpose

A generic framework for testing web user interfaces, the sibling of
[api-qa-agentic-framework](https://github.com/marceloancieta/api-qa-agentic-framework). It keeps the
same process and guardrails, applied to the browser:

- Five phases, each ending at a human review gate: intake → design → automate → publish → run.
- Design and execution never mix.
- Each application under test is an **app pack** in `apps/<pack>/`; the core never imports a pack.
- External systems sit behind adapters chosen in `qa-config`: test management (`allure-testops`,
  `allure-report`, `local`) and tracker (`jira`, `github`, `local`).
- Claude Code skills for phases, rules for guardrails, hooks for enforcement, agents for isolated
  reviews.

## Decisions

| Topic | Decision |
|---|---|
| Name | `web-qa-agentic-framework` (web, not native mobile) |
| npm package | `create-web-qa`, used as `npm create web-qa@<version> <dir>` (FUT-02) |
| Shared code | The generic parts (adapters, hooks, linters, libraries) live in this repository; a core shared with the sibling API framework is FUT-09 |
| App packs | v0.1: OWASP Juice Shop (local Docker, the fully worked pack) and SauceDemo (public, read-only). v0.2: Practice Software Testing "Toolshop" (local Docker) |
| v0.1 scope | Complete foundation: five phases, adapters, desktop and mobile projects, accessibility, visual regression in a container, network mocking, state injection |
| UI pattern | Page Object Model with components, role fixtures and optional flows. Screenplay is documented as a rejected alternative in the architecture ADR |
| Quality dimensions | Seven UI quality dimensions (section 6b): the core in v0.1, the rest in v0.2. Each feature declares which apply and a linter checks it |
| Exploratory sessions | A `qa-explore` skill comes in v0.2, after intake is stable and an ADR decides its mode. In v0.1 the intake template accepts notes from manual exploration as a source |
| Runtime | Node and TypeScript only; Playwright Test |
| License | Apache-2.0, with a NOTICE file ([ADR 0004](adr/0004-apache-2-license.md)) |
| Language | Everything in the repository is in English |
| Publishing | Nothing is pushed, published or made public without the owner's explicit approval |

## 1. Architecture and patterns

### 1.1 Tool: Playwright with TypeScript

| Criterion | Playwright | Cypress | WebdriverIO |
|---|---|---|---|
| Chromium, Firefox and WebKit | native | WebKit experimental | through drivers or a grid |
| Mobile emulation (viewport, touch, user agent, `isMobile`) | `devices` projects | viewport only | yes; Appium for native apps |
| HTTP requests in the same runner (state injection) | `APIRequestContext` | `cy.request`, queued with commands | separate library |
| Network interception | `page.route`, `routeFromHAR` | `cy.intercept` | limited, or CDP |
| Multiple tabs, origins and frames | yes | limited | yes |
| Parallel runs and sharding without a paid service | yes | orchestration is a paid service | yes |
| Auto-waiting and web-first assertions | yes | command retry | partial |
| Trace viewer (DOM, network, console per step) | yes | runner time travel | no |
| Visual and accessibility | built-in `toHaveScreenshot`; `@axe-core/playwright` | plugins | services |

Playwright with TypeScript. WebdriverIO would only win if native mobile apps were in scope; they
are not, and the name says so.

### 1.2 Pattern: Page Object Model with components, role fixtures and optional flows

- **Page objects** own locators and actions and return `Locator`s. They never assert.
- **Components** (header, navigation menu, dialogs, product card) are page objects for a part of a
  page, shared between pages.
- **Role fixtures** ("actors"): a fixture per role yields a browser context that is already signed in
  through an injected `storageState`, plus the pack's API client bound to the same user. "Actor" only
  names the fixture.
- **Flows** are optional business tasks (sign up, checkout) over pages and the API client. A flow is
  written only when the same sequence appears in two or more specs.
- **Journeys** are end-to-end cases across features (sign in, find, buy, see the order), kept in a
  journey registry of their own and tagged `@e2e`. They chain flows through the UI and prove their
  end through the API client; a pack keeps one to three
  ([registry rule](../.claude/rules/registry.md#journeys)).

| Criterion | Page objects only | Full Screenplay | Page objects + components + fixtures (+ flows) |
|---|---|---|---|
| Standard in Playwright with TypeScript | standard | minority (Serenity BDD, Serenity/JS) | standard plus Playwright's own idioms |
| Layer isolation | medium; pages grow large | high | high, enforced by `lint:layers` |
| Verbosity | low | high: a class per interaction and question | medium-low |
| Reuse across pages | poor without components | good | good |
| Several roles | manual login per test | actor with abilities | role fixture with an injected session |
| Checks that do not retry | low risk | high risk: one-shot questions such as `isVisible()` | low risk: web-first assertions stay in specs |

Screenplay is rejected for verbosity, one-shot questions that do not retry, the learning curve for
adopters, and Serenity/JS reporting that would compete with the adapters.

Layers, top to bottom:

```
specs        web-first assertions (expect(locator)...) and the case's orchestration
flows        optional business tasks over pages and api/
actors       role fixture: BrowserContext with storageState + api/ client of the same user
pages/       page objects and components: own locators and actions, return Locators,
components/    never assert
api/         the pack's clients that prepare and verify state (APIRequestContext)
mocks/       the pack's network handlers, built on the core helpers
core         helpers/ and fixtures/: config, actors, evidence, accessibility, visual, network,
             redaction, data. Never imports from apps/<pack>
```

Checked rules (`lint:layers`, `lint:harness`): no `page.locator`, `page.route` or CSS in specs; no
`expect` in page objects; no import of `apps/` from the core; no `waitForTimeout`; no XPath.

### 1.3 Repository layout

```
web-qa-agentic-framework/
  .claude/  rules/ skills/ agents/ hooks/ settings.json
  apps/<pack>/
    app.json                 name, version, title, testIdAttribute, breakpoints,
                             third_party_hosts, secret_keys, identity_fields, workers
    README.md
    docs/  app-notes.md  features/<feature>.md  app-map.json (tracked, generated)
    registry/<feature>.md
    rules/*.yaml             decision tables
    pages/  components/  flows/  api/  builders/  mocks/
    specs/
    visual/                  baselines per project, generated only in the container
    a11y-known.json          known violations with a tracker key and an expiry
    fixtures.ts
  helpers/  fixtures/        core
  scripts/  lib/ tm/ tracker/ lint-*.mjs app-map.mjs scaffold-app.mjs ...
  docker/                    pinned Playwright image, compose files for the local packs
  docs/  adr/ guides/ templates/ tracker/ architecture.md backlog.md onboarding.md
         test-management.md
  schemas/qa-config.schema.json
  qa-config.example.json  playwright.config.ts  audit-known.json
```

`qa-config` is organised by app pack ([ADR 0008](adr/0008-per-pack-configuration.md)):

- `app.default_environment`, and `app.accessibility.tags` for axe
- `app.environments.<env>.projects`: the device projects the environment runs
- `app.environments.<env>.packs.<pack>`: `base_url`, `allow_writes`,
  `recovery{command, ready_timeout_s}`, `actors{<role>: {account, ...}}` and `default_actor`
- `test_management` and `tracker`: the adapter each one uses, with its options; `policies`: the
  commit rules `git-policy` applies
- `quality_gate`: `pass_rate`, new accessibility violations per impact, visual differences, and the
  `mutation` score of `npm run mutation`; web vitals in v0.2

## 2. Devices and selectors

- **Projects from qa-config:** `desktop-chromium`, `desktop-webkit`, `desktop-firefox`, `tablet`
  (iPad, WebKit), `mobile-chrome` (Pixel 7), `mobile-safari` (iPhone 14, WebKit), and `-landscape`
  variants for orientation. `playwright.config.ts` builds them; each environment picks which run
  (`local`: desktop Chromium and mobile Chrome; `ci`: six device projects). The catalog is
  `helpers/device-projects.json`. An environment marked `pairwise` (`ci`) stands for the whole
  catalog: config:check proves its projects realize every browser × form factor pair, and
  `npm run pairwise` spreads each pack's roles over them (`scripts/lib/run-matrix.mjs`). The a11y
  sweep follows that set there: each project sweeps the routes of the roles it is given
  (`pairwiseSkip` in `helpers/a11y-sweep.ts`), and the others are skipped with the reason.
- **Locator policy**, in the generation rule and in the linter: `getByRole` and `getByLabel`, then
  `getByTestId` (attribute set per pack in `app.json`; SauceDemo uses `data-test`), then `getByText`
  with a deliberate `exact`, then CSS only with a comment that says why. XPath and `nth-child` are
  rejected.
- **The responsive menu without duplicated specs:** a `NavigationMenu` component offers one API
  (`open(item)`, `items()`) and picks its strategy (visible bar or hamburger) from the **project**
  (`isMobile`, or the viewport width against the pack's `breakpoints`), never by probing visibility
  at run time. The spec is the same on every project.
- **Real differences in behaviour** are written in the feature contract doc and tagged
  `@desktop-only` or `@mobile-only`; each project filters them out with `grepInvert`, and the linter
  requires the registry case to state the reason.
- **Design:** pairwise over browser × device × role instead of the full product: a registry lists
  the runs of its pairwise cases under `pairwise`, and `lint-suite` pairwise-gap names a pair they
  leave out.

## 3. Visual regression and accessibility

**Visual regression without cross-OS noise**

- A `visual` lane that runs **only inside the official Playwright image pinned by digest**, the same
  version as `@playwright/test` (a gate checks they match). Outside the container the lane refuses to
  run and says why. One set of baselines, no OS suffix.
- Stability: `animations: 'disabled'`, `caret: 'hide'`, fonts installed in the image, every image in
  view loaded before the shot (`imagesLoaded`), dynamic regions masked by the page object (not the spec), a per-pack `stylePath` that hides volatile parts, a
  per-pack `maxDiffPixelRatio`. A case about a whole page grows the viewport to the content's height
  at the same width (`wholePage`), since layouts that scroll an inner box defeat a full-page
  screenshot.
- **Updating baselines is design, not execution:** only the automate phase regenerates them, with the
  diff images shown at its gate; the run phase never passes `--update-snapshots` (the lane rejects
  it).
- **The check is tested both ways:** SauceDemo's `visual_user` renders real differences; one case
  proves the lane fails with it and passes with `standard_user`.

**Accessibility in the core workflow**

- An `a11y` fixture on `@axe-core/playwright`: `expectNoNewViolations(page, { include, exclude })`
  with the WCAG tags from qa-config (default `wcag2a`, `wcag2aa`, `wcag21aa`).
- **Per-pack baseline** (`a11y-known.json`): rule, target, tracker key, expiry. A new violation fails;
  a known one that disappeared is reported so it leaves the baseline. Juice Shop has real violations,
  so the baseline is demonstrated on real data.
- Two uses: a check inside `@a11y` cases, and an **a11y sweep** lane over the routes in
  `app-map.json`. The full axe result is attached as evidence; the quality gate counts new critical
  and serious violations (threshold in qa-config, default 0).

## 4. State injection and network mocking

**Preparing state without the UI**

- Each pack has `api/`, thin clients over `APIRequestContext`. The actor fixture creates the user
  through the API (unique per worker), signs in through the API, writes the `storageState` to
  `.auth/<env>/<pack>/<role>-<worker>.json` (ignored by git, guarded by `secret-guard`) and opens a
  context that is already signed in. Cleanup in `finally`, or the environment's `recovery`.
- Juice Shop: sign-up and login through its REST API put the token in storage; the pack's
  `app.json` `cookies` dismiss the welcome and cookie banners, so no test clicks them away.
- SauceDemo has no API: the session cookie and the cart in `localStorage` are injected.
- **Rule:** only the feature under test goes through the UI. One case per pack proves the UI login,
  with credentials created during the run, so no password ends up in a trace.
- Optional independent oracle: check through `api/` what the UI claims to have done; an error toast
  does not prove nothing changed.

**Network mocking**

- Core `network` helpers: `blockThirdParties(app.json third_party_hosts)`, `mockJson`,
  `failWith(status)`, `delay(ms)`, `offline()`, optional `routeFromHAR` (HAR files go through the
  secret scan and redaction).
- Specs call the pack's `mocks/` functions, never `page.route` directly.
- Mocked cases carry `@mocked`; the traceability check refuses an integration requirement covered
  only by mocked cases.
- Main use: error states (500, timeout, empty) that the real system does not produce on demand.

## 5. CI that does not depend on a vendor, and the browser matrix

- **The contract is npm plus Docker:** `npm run gates`, `npm test -- --project=...`, the lanes
  (`visual`, `a11y`, `known-gap`, `destructive`, `flake`), `npm run tm:report`. CI files only call
  these scripts: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (primary) and the
  [`Jenkinsfile`](../Jenkinsfile) ([Jenkins](guides/jenkins.md): the same steps on one agent,
  Windows or Linux), checked by `scripts/__tests__/ci-files.test.mjs`. The flake lane runs
  weekly and on demand, outside the pipeline of each change. `act` runs the GitHub jobs on a
  local machine before a workflow change is pushed
  ([the workflows on your machine](guides/running-tests.md#the-workflows-on-your-machine)).
- Jobs: gates → local packs in compose (pinned by digest) → project matrix with `--shard=i/n` and the
  `blob` reporter (`QA_BLOB_REPORT=1`) → `npm run ci:merge` → quality gate over the merged report and
  the lanes' reports, one `QA_RUN_ID` for all of them → report to test management.
- Supply chain: every action of a workflow is pinned to a commit SHA; Dependabot proposes npm and
  action updates after a cooldown of 14 days ([`.github/dependabot.yml`](../.github/dependabot.yml));
  `npm run audit:deps` keeps `npm audit` clean in the gates job, against a list of advisories with
  no safe fix yet, each with a reason and an expiry ([`audit-known.json`](../audit-known.json));
  CodeQL scans the sources ([`.github/workflows/codeql.yml`](../.github/workflows/codeql.yml)).
  The gates scan the whole history for secrets, denylisted terms and the wording of every commit
  message.
- Advisory review: on each pull request with the `ANTHROPIC_API_KEY` secret, Claude reads the diff
  against [`.github/pr-review-rubric.md`](../.github/pr-review-rubric.md), which leaves out what the
  gates check, and posts one comment (`npm run review:pr`,
  [`.github/workflows/pr-review.yml`](../.github/workflows/pr-review.yml)). It is not a required
  check and decides nothing.
- `workers` per pack in `app.json`: some systems under test do not tolerate parallel runs.
- The visual lane runs in the container both locally and in CI.

## 6. App packs

| Pack | Environment | Login / sign-up | State injection | Demonstrates |
|---|---|---|---|---|
| `juice-shop` (v0.1) | local Docker, image pinned by digest, `allow_writes: true`, `recovery` restarts it | yes / yes | REST API | all five phases, actors and roles, accessibility baseline on real data, mocking, destructive lane |
| `saucedemo` (v0.1) | public, `allow_writes: false` | yes, with variant users / no | cookie and `localStorage` | read-only pack, visual (`visual_user`), anti-flake (`performance_glitch_user`), `locked_out_user` |
| `toolshop` (v0.2) | local Docker | yes / yes, admin and customer roles | REST API | authorization in the UI by role, `data-test` attributes, a third data model |

Demo credentials, public or not, come from `.env`: each actor in qa-config names its variables
(`username_env`, `password_env`), a missing one fails by name before the run, and the values never
appear in specs or docs. `app.json` `secret_keys` names the fields redaction masks.

## 6b. UI quality dimensions

**Enforced, not only written down:** the feature contract template carries a checklist of the seven
dimensions; each registry declares in its header which apply (or `n/a` with a reason), and
`lint-suite` fails when a declared dimension has no case. One tag per dimension, defined in the
single tag taxonomy (`scripts/lib/tags.mjs`): `@responsive`, `@perf`, `@security`, `@layout`,
`@navigation`, `@a11y`, `@content`. `@visual` (the visual lane) and `@i18n` (locale projects, v0.2)
say how a case runs rather than which dimension it covers.

| Dimension | v0.1 | v0.2 |
|---|---|---|
| **Responsiveness** | tablet and landscape projects; a "no horizontal scroll" check per breakpoint (`scrollWidth ≤ clientWidth`); visual per project | — |
| **Perceived performance** | loading indicators: a mock adds `delay(ms)` and the case checks the spinner appears and goes away; no flash of empty content | web vitals (LCP, CLS, INP) in Chromium with per-pack budgets in qa-config; a Lighthouse lane; `prefers-reduced-motion` emulation (animation smoothness cannot be measured reliably) |
| **Security in the UI** | password fields use `type=password` and the right `autocomplete`; generic login errors (no user enumeration); protected routes redirect without a session; after logout, Back shows no data; nothing sensitive in the URL or `localStorage`; injection payloads from the builders render as text | security headers (CSP, frame options) per response; a ZAP baseline lane against the UI (container lanes) |
| **Layout and design** | a **page health guard** on every test (opt-out with a reason): broken images, failed same-origin requests, console errors (with the fields of an error object they log), uncaught exceptions; visual regression covers alignment | design-token checks (colour, font, size from the pack's `design-tokens.json`) on key components |
| **Navigation and interaction** | states through `toBeDisabled` and `toBeFocused`; hover and focus states in visual; Back and Forward, deep links, reload keeps state, a session across tabs | — |
| **Accessibility** | axe (colour contrast included) with a baseline; a keyboard helper (tab order by accessible name, visible focus, no focus traps); **ARIA snapshots** (`toMatchAriaSnapshot`) as a regression of what a screen reader announces | — |
| **Content handling** | builders with boundary and very long texts (injected through the API or mocks) plus an overflow check and visual | i18n: projects per `locale` and `timezoneId`, pseudo-localization (+40 % text), right-to-left; Juice Shop has a language switch |

**Also in v0.1:** controlled time with `page.clock` (session timeout, countdowns, dates) and file
upload and download. **Rejected in an ADR:** self-healing locators, because they hide defects.
**v0.2 or later:** TOTP two-factor login (Juice Shop has it; the test generates the code), a mail
catcher pattern (Mailpit) for applications that verify by email, and the `qa-explore` skill
(chartered exploratory sessions whose findings feed intake; an ADR first decides its mode, since it
submits forms).

## 7. The five phases for a UI

| Phase | Skill | Produces | What is specific to a UI |
|---|---|---|---|
| 0 intake | `qa-intake` | `apps/<pack>/docs/features/<feature>.md` | The structural source is the **app map**, plus a story or issue (jira, github, local), an optional intake request and manual exploration notes |
| 1 design | `qa-design` | `apps/<pack>/registry/<feature>.md` | UI techniques: EP and BVA from form constraints, state transitions, decision tables, pairwise over devices |
| 2 automate | `qa-automate` | specs, pages, components, flows, mocks, baselines | Locators captured live, read-only; review by `ui-spec-reviewer`; baselines written only in the container |
| 3 publish | `qa-publish` | case definitions in test management | One definition per case, whatever the number of device projects |
| 4 run | `qa-run` | a reported run | One result per case, the worst of its devices; never touches baselines or specs |

- **App map**, the structural source of intake: `npm run app:map -- --pack <pack>` walks the
  application read-only (same origin, no form submission, login allowed) and records routes,
  landmarks, a summarized accessibility tree, forms with their HTML constraints (`required`,
  `maxlength`, `pattern`, `type`) and the endpoints seen on the network. It is tracked; its drift
  against the live application is a lane.
- **Modes for a UI:** design navigates and reads, plus the pack's login. Submitting forms or signing
  up in design is forbidden outside a spec run.
- **Feature contract doc for a UI:** source, routes, roles and entry state, elements by accessible
  name, business rules, validations, states (empty, loading, error, success), responsive
  differences, accessibility expectations, network dependencies, open questions.
- **Agents:** `spec-author`; `ui-spec-reviewer` (brittle locators, waits, assertions that cannot fail
  or pass by coincidence, layers, title against body) with evaluation fixtures;
  `behaviour-investigator` (requirement against observed UI, read-only).
- **Hooks:** `secret-guard` refuses and masks credentials, `git-policy` applies the commit rules of
  qa-config, and `session-probe` checks each
  pack's URL and its login page.

## 8. Shared with the API framework

The framework shares its process, adapters, hooks and generic libraries with the sibling
[api-qa-agentic-framework](https://github.com/marceloancieta/api-qa-agentic-framework); extracting a
core both use is FUT-09 in the [backlog](backlog.md).
