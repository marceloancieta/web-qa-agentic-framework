# Backlog

Open work for the framework. This file holds **active work only**: a finished row moves to the
**Done** section at the end with its closing commit and keeps its id forever, so references in
commits and docs stay valid. The design behind the items is in [`architecture.md`](architecture.md).

- Commits follow the ADR 0006 message convention (`type(scope): ID summary`), one stage or item each.
- **Status** is one of `todo` · `in-progress` · `blocked`. A row that will not be done moves to
  **Done** like a finished one, its item starting with `**Won't do.**` and the reason.
- **Origin**: `exp` = an established practice from field experience; `practice` = an established
  industry practice (ISTQB, OWASP, WCAG, testing literature); `plan` = the framework's own roadmap;
  `ADR NNNN` = a recorded decision.
- **Prefixes**: `REPO` repository setup · `CORE` execution core · `GATE` linters, gates and lanes ·
  `TM` test management and trackers · `PROC` agentic process · `JS` the Juice Shop pack · `SD` the
  SauceDemo pack · `AGT` agents · `CI` continuous integration · `DOC` documentation and release ·
  `FUT` later work.
- **Stage** groups the items of v0.1.0 into the order they are built (W1 to W9). Each stage ends with
  `npm run gates` green, the secret and denylist scans clean, and one local commit.

---

## v0.1.0

The complete foundation: five phases, adapters, desktop and mobile projects, accessibility, visual
regression in a container, network mocking and state injection, proven on Juice Shop and SauceDemo.

| Id | Stage | Item | Origin | Status |
|---|---|---|---|---|
| REPO-01 | W0 | Bootstrap and safety: Apache-2.0 and NOTICE, gitleaks and the local denylist in the git hooks, Claude Code hooks and settings, minimal gates, agent guides, ADRs 0001 to 0007. | plan | in-progress |
| CORE-01 | W1 | qa-config schema with app packs (`app.environments.<env>.packs.<pack>`, `app.projects`, `quality_gate`), `qa-config.example.json` with the commit rules on, and `config:check` in the gates. | plan | todo |
| CORE-02 | W1 | `playwright.config.ts` built from qa-config: desktop Chromium, WebKit and Firefox, tablet, mobile Chrome and Safari, landscape variants; `@desktop-only` and `@mobile-only` filtered per project. | plan | todo |
| CORE-03 | W1 | Actor fixture: a user per worker created through the pack's API, `storageState` under `.auth/`, the pack's API client bound to the same user, cleanup in `finally`. | plan | todo |
| CORE-04 | W1 | Accessibility fixture on axe with the WCAG tags from qa-config and a per-pack baseline (`a11y-known.json`: rule, target, tracker key, expiry). | practice | todo |
| CORE-05 | W1 | Visual fixture: masks owned by page objects, per-pack `stylePath` and `maxDiffPixelRatio`, animations and caret off. | plan | todo |
| CORE-06 | W1 | Network helpers: `blockThirdParties`, `mockJson`, `failWith`, `delay`, `offline`, optional `routeFromHAR` with redaction. | plan | todo |
| CORE-07 | W1 | Evidence and redaction: traces and screenshots mask sensitive fields; HAR files pass the secret scan. | exp | todo |
| CORE-08 | W1 | Page health guard on every test, with an opt-out that needs a reason: broken images, failed same-origin requests, console errors, uncaught exceptions. | plan | todo |
| CORE-09 | W1 | Keyboard helper (tab order by accessible name, visible focus, no traps), overflow and no-horizontal-scroll checks, `page.clock` helpers, upload and download helpers. | plan | todo |
| CORE-10 | W1 | Per-pack preflight: every entry point names a missing secret before the run starts. | exp | todo |
| CORE-11 | W1 | Generic script libraries from the sibling framework: registry, tags, env, env-names, results, playwright-lane, container, pairwise, decision-table, and the anonymization, rng, clock, run-lock and data-gate helpers. | plan | todo |
| GATE-01 | W1 | `lint:layers`: no `page.locator`, `page.route` or CSS in specs, no `expect` in page objects, no import of `apps/` from the core. | ADR 0005 | todo |
| JS-01 | W2 | Juice Shop pack: compose with the image pinned by digest, `app.json`, `recovery`, `npm run juice-shop:up`. | plan | todo |
| JS-02 | W2 | Juice Shop `api/` clients (sign-up, login) and actors; cookies that dismiss the welcome and cookie banners. | plan | todo |
| JS-03 | W2 | First Juice Shop pages and components, including a `NavigationMenu` that picks its strategy from the project. | plan | todo |
| JS-04 | W2 | Smoke: UI login with credentials created during the run, and API login, on desktop Chromium and mobile Chrome. | plan | todo |
| CORE-12 | W2 | `scaffold:app` creates a pack skeleton. | plan | todo |
| CORE-13 | W2 | `app:map`: a read-only walk that records routes, landmarks, a summarized accessibility tree, forms with their HTML constraints and the endpoints seen; tracked, with a drift lane. | plan | todo |
| CORE-14 | W2 | `session-probe` also checks each pack's login page, not only its host. | plan | todo |
| GATE-02 | W3 | `lint:harness`: no `waitForTimeout`, no XPath or `nth-child`, the locator policy (ADR 0007), soft assertions above an expected-failure arm. | ADR 0007 | todo |
| GATE-03 | W3 | `lint:suite`, including a declared quality dimension without cases and `@desktop-only`/`@mobile-only` cases without a reason. | plan | todo |
| GATE-04 | W3 | `lint:docs`: links and file references resolve, host placeholders in hand-written repro steps. | exp | todo |
| GATE-05 | W3 | Coverage status, cited status and traceability; an integration requirement covered only by `@mocked` cases is refused. | plan | todo |
| GATE-06 | W3 | Quality gate: pass rate, new critical and serious accessibility violations, visual diff limits. | plan | todo |
| GATE-07 | W3 | Visual lane runs only in the pinned Playwright image (a gate checks the image matches `@playwright/test`), refuses `--update-snapshots` in the run phase; ADR on container lanes. | plan | todo |
| TM-01 | W4 | Test-management adapters (`local`, `allure-report`, `allure-testops`) and the manifest; a case's identity is its id, never its title. | plan | todo |
| TM-02 | W4 | Tracker adapters (`jira`, `github`, `local`). | plan | todo |
| TM-03 | W4 | Contract tests with read-back of every write; metadata repair with a scope; ADR on how known gaps appear in test management. | exp | todo |
| PROC-01 | W5 | Rules: modes, app packs, registry, generation (locator policy), tagging (one tag per dimension), reporting, documentation, reachability. | plan | todo |
| PROC-02 | W5 | Skills: `qa-intake`, `qa-design`, `qa-automate`, `qa-publish`, `qa-run`, `qa-report-bug`. | plan | todo |
| PROC-03 | W5 | Templates: intake (manual exploration notes accepted as a source), UI feature contract with the quality-dimensions checklist, registry with declared dimensions. | plan | todo |
| PROC-04 | W5 | `juice-shop-ui` pack skill. | plan | todo |
| JS-05 | W6 | Juice Shop phases 0 and 1: app map, contract docs and registries for sign-up and login, basket and search. | plan | todo |
| AGT-01 | W7 | `spec-author`: writes, runs and reports the specs of an assigned set of approved cases. | plan | todo |
| AGT-02 | W7 | `ui-spec-reviewer` with evaluation fixtures: brittle locators, waits, assertions that cannot fail or pass by coincidence, layers, title against body. | plan | todo |
| AGT-03 | W7 | `behaviour-investigator`: one requirement against the observed UI, read-only. | plan | todo |
| JS-06 | W8 | Juice Shop phases 2 to 4 for a representative sample. | plan | todo |
| GATE-08 | W8 | Lanes: visual, a11y sweep over the app map, mocked, known-gap, destructive, flake. | plan | todo |
| CI-01 | W8 | Project matrix with `--shard` and the `blob` reporter, `merge-reports`, quality gate, report to test management. | plan | todo |
| CI-02 | W8 | GitHub Actions workflow and a Jenkinsfile that only call the npm scripts. | plan | todo |
| SD-01 | W9 | SauceDemo pack, read-only: cookie and `localStorage` injection, `visual_user` proves the visual lane fails, `performance_glitch_user` for anti-flake, `locked_out_user`. | plan | todo |
| DOC-01 | W9 | README, onboarding and guides. | plan | todo |
| DOC-02 | W9 | Read-only documentation review before the release. | exp | todo |
| CI-03 | W9 | CodeQL and `npm audit` clean; full-history scans (gitleaks, denylist, banned wording). | exp | todo |
| DOC-03 | W9 | CHANGELOG and tag `v0.1.0`; the GitHub repository and any publishing only with the owner's approval. | plan | todo |

**Acceptance for v0.1.0**

- The Juice Shop suite runs on desktop Chromium, desktop WebKit and mobile Chrome, and two
  consecutive runs give the same result (flake lane).
- Visual: the lane passes twice in the container, fails with `visual_user` and refuses to run outside
  the container.
- Accessibility: a new violation seeded in a fixture fails; a known one with a key does not.
- State injection: the actor starts signed in without touching the login screen (checked in the
  trace); the UI login case leaves no password in traces or reports.
- Test management and tracker: `tm:publish` with read-back and `tracker get/search`, both with
  `local`.
- Quality dimensions: the page health guard fails on a seeded broken image and passes on a healthy
  page; the horizontal-scroll check fails on an overflowing fixture; the dimensions linter fails on a
  registry that declares `@security` without cases; a deliberately changed ARIA snapshot fails.

## v0.2.0

| Id | Item | Origin | Status |
|---|---|---|---|
| FUT-01 | Toolshop pack (Practice Software Testing, local Docker): authorization in the UI by role, `data-test` attributes. | plan | todo |
| FUT-02 | `npm create web-qa@<version> <dir>` (package `create-web-qa`). | plan | todo |
| FUT-03 | Web vitals (LCP, CLS, INP) with per-pack budgets, and a Lighthouse lane. | practice | todo |
| FUT-04 | i18n: projects per `locale` and `timezoneId`, pseudo-localization, right-to-left. | practice | todo |
| FUT-05 | Design-token checks from the pack's `design-tokens.json`; `prefers-reduced-motion` emulation. | plan | todo |
| FUT-06 | Security headers per response and a ZAP baseline lane against the UI. | practice | todo |
| FUT-07 | TOTP two-factor login and a mail-catcher pattern (Mailpit). | plan | todo |
| FUT-08 | `qa-explore` skill for chartered exploratory sessions, after an ADR decides its mode. | plan | todo |
| FUT-09 | Extract a shared core with the sibling API framework once both are stable. | plan | todo |

---

## Done

| Id | Item | Closed by |
|---|---|---|
