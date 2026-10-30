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
| JS-06 | W8 | Juice Shop phases 2 to 4 for a representative sample. | plan | in-progress |
| JS-07 | W8 | Juice Shop checkout: intake (address, delivery, payment, summary, completion, history), design, and the purchase journey from the login form to the order in the history. | plan | in-progress |
| PROC-05 | W8 | End-to-end journeys as a capability of their own: a journey registry per pack whose rules chain the rules of several features, the `@e2e` tag the lanes and CI select, and the generation rules for a journey (every step through the UI, flows, the end checked through `api/`, few journeys). | plan | in-progress |
| CI-01 | W8 | Project matrix with `--shard` and the `blob` reporter, `merge-reports`, quality gate, report to test management. | plan | in-progress |
| CI-02 | W8 | GitHub Actions workflow and a Jenkinsfile that only call the npm scripts. | plan | todo |
| SD-01 | W9 | SauceDemo pack, read-only: cookie and `localStorage` injection, `visual_user` proves the visual lane fails, `performance_glitch_user` for anti-flake, `locked_out_user`. | plan | todo |
| DOC-01 | W9 | README, onboarding and guides. The README separates what the framework offers ("What you get": a table of capabilities such as the five gated phases, device projects, accessibility with a baseline, visual regression in a container, network mocking, adapters, skills, hooks and agents) from what it is built with ("Built with": Node, Playwright, TypeScript, axe, Docker, Allure), keeps badges to license, Node and Playwright (CI once the repository is on GitHub), and adds a table of contents when it grows past about six sections. | practice | todo |
| DOC-02 | W9 | Read-only documentation review before the release. It also removes the temporary "What arrives when" table from `CLAUDE.md`, reduces architecture section 8 to one line on what is shared with the sibling API framework, and moves architecture section 9 to `docs/lessons-learned.md` or drops it, so the public docs describe how the framework works, not how it was built. The backlog rows and the lessons describe technical work only, with no personal notes, comments about third parties or hints of where a lesson came from (the denylist scan catches names and hosts, not tone). | exp | todo |
| CI-03 | W9 | CodeQL and `npm audit` clean; full-history scans (gitleaks, denylist, banned wording). | exp | todo |
| DOC-04 | W9 | Community files before publishing. `SECURITY.md`: report through GitHub private vulnerability reporting, never a public issue; scope (a vulnerability of an application under test, such as the deliberately vulnerable Juice Shop, belongs to that application's project, not this one); what the framework does to keep secrets out (secret-guard, gitleaks and the denylist, redaction of traces, HAR files and screenshots, `.auth/` ignored); responsible use (only the systems qa-config names and the tester is authorized to test, never production); supported versions (before 1.0, only the latest). `CONTRIBUTING.md`. `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), once the owner chooses its contact channel. | practice | todo |
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
| FUT-02 | `npm create web-qa@<version> <dir>` (package `create-web-qa`). The generated project gets the product (`.claude/`, `AGENTS.md`, `CLAUDE.md`, templates, core, gates) and none of the framework's own development records (this backlog, `CHANGELOG.md`, the framework's ADRs); a test lists what the package ships. | plan | todo |
| FUT-03 | Web vitals (LCP, CLS, INP) with per-pack budgets, and a Lighthouse lane. | practice | todo |
| FUT-04 | i18n: projects per `locale` and `timezoneId`, pseudo-localization, right-to-left. | practice | todo |
| FUT-05 | Design-token checks from the pack's `design-tokens.json`; `prefers-reduced-motion` emulation. | plan | todo |
| FUT-06 | Security headers per response and a ZAP baseline lane against the UI. | practice | todo |
| FUT-07 | TOTP two-factor login and a mail-catcher pattern (Mailpit). | plan | todo |
| FUT-08 | `qa-explore` skill for chartered exploratory sessions, after an ADR decides its mode. | plan | todo |
| FUT-09 | Extract a shared core with the sibling API framework once both are stable. | plan | todo |
| FUT-10 | Pairwise: a library that reduces browser × device × role to a covering set, used by the full CI projects (architecture section 2) and to check the pairwise notes of a registry. | practice | todo |

---

## Done

| Id | Item | Closed by |
|---|---|---|
| REPO-01 | Bootstrap and safety: Apache-2.0 and NOTICE, gitleaks and the local denylist in the git hooks, Claude Code hooks and settings, minimal gates, agent guides, ADRs 0001 to 0007. | `678ffb6` |
| CORE-01 | qa-config schema with app packs (`app.environments.<env>.packs.<pack>`, `app.projects`, `quality_gate`), `qa-config.example.json` with the commit rules on, and `config:check` in the gates. | `12b64de` |
| CORE-02 | `playwright.config.ts` built from qa-config: desktop Chromium, WebKit and Firefox, tablet, mobile Chrome and Safari, landscape variants; `@desktop-only` and `@mobile-only` filtered per project. | `12b64de` |
| CORE-10 | Per-pack preflight: every entry point names a missing secret before the run starts. | `12b64de` |
| CORE-11 | The script libraries the core uses from the start: env, env-names, tags, lint, corpus. The other generic libraries arrive with their first consumer: results, playwright-lane and container with the gates and lanes (W3), registry with the suite linter (W3), decision-table with the first registries (W6, GATE-09; pairwise moved to FUT-10), and the anonymization, rng, clock, run-lock and data-gate helpers with the fixtures that use them. | `12b64de` |
| GATE-01 | `lint:layers`: no `page.locator`, `page.route` or CSS in specs, no `expect` in page objects, no import of `apps/` from the core. | `12b64de` |
| CORE-03 | Actor fixture: a user per worker created through the pack's API, `storageState` under `.auth/`, the pack's API client bound to the same user, cleanup in `finally`. | `58a7a83` |
| CORE-04 | Accessibility fixture on axe with the WCAG tags from qa-config and a per-pack baseline (`a11y-known.json`: rule, target, tracker key, expiry). | `58a7a83` |
| CORE-05 | Visual fixture: masks owned by page objects, per-pack `stylePath` and `maxDiffPixelRatio`, animations and caret off. | `58a7a83` |
| CORE-06 | Network helpers: `blockThirdParties`, `mockJson`, `failWith`, `delay`, `offline`, optional `routeFromHAR` with redaction. | `58a7a83` |
| CORE-07 | Evidence and redaction: traces and screenshots mask sensitive fields; HAR files pass the secret scan. | `58a7a83` |
| CORE-08 | Page health guard on every test, with an opt-out that needs a reason: broken images, failed same-origin requests, console errors, uncaught exceptions. | `58a7a83` |
| CORE-09 | Keyboard helper (tab order by accessible name, visible focus, no traps), overflow and no-horizontal-scroll checks, `page.clock` helpers, upload and download helpers. | `58a7a83` |
| JS-01 | Juice Shop pack: compose with the image pinned by digest, `app.json`, `recovery`, `npm run juice-shop:up`. | `b267400` |
| JS-02 | Juice Shop `api/` clients (sign-up, login) and actors; cookies that dismiss the welcome and cookie banners. | `b267400` |
| JS-03 | First Juice Shop pages and components, including a `NavigationMenu` that picks its strategy from the project. | `b267400` |
| JS-04 | Smoke: UI login with credentials created during the run, and API login, on desktop Chromium and mobile Chrome. | `b267400` |
| CORE-12 | `scaffold:app` creates a pack skeleton. | `5e8e527` |
| CORE-13 | `app:map`: a read-only walk that records routes, landmarks, a summarized accessibility tree, forms with their HTML constraints and the endpoints seen; tracked, with a drift lane. | `5e8e527` |
| CORE-14 | `session-probe` also checks each pack's login page, not only its host. | `5e8e527` |
| GATE-02 | `lint:harness`: no `waitForTimeout`, no XPath or `nth-child`, the locator policy (ADR 0007), soft assertions above an expected-failure arm. | `672badc` |
| GATE-04 | `lint:docs`: links and file references resolve, host placeholders in hand-written repro steps, and a `public-wording` rule over tracked docs, code comments and commit messages that reports phrases presenting the framework as taken from another codebase ("predecessor", "ported from", "copied from", "based on an earlier", "carried over"), matched on word boundaries so words such as "reporting" pass; its self-test holds the phrases and accepted look-alikes. Tone in general stays a DOC-02 review. | `672badc` |
| GATE-03 | `lint:suite`, including a declared quality dimension without cases and `@desktop-only`/`@mobile-only` cases without a reason. | `a05be7e` |
| GATE-05 | Coverage status and traceability; an integration requirement covered only by `@mocked` cases is refused. The cited status (contract rules cited by cases) moves to PROC-03, with the contract format. | `a05be7e` |
| GATE-06 | Quality gate: pass rate, new critical and serious accessibility violations, visual diff limits. | `ed0acfa` |
| GATE-07 | Visual lane runs only in the pinned Playwright image (a gate checks the image matches `@playwright/test`), refuses `--update-snapshots` in the run phase; ADR on container lanes. | `ed0acfa` |
| TM-01 | Test-management adapters (`local`, `allure-report`, `allure-testops`) and the manifest; a case's identity is its id, never its title. | `457f6a5` |
| TM-02 | Tracker adapters (`jira`, `github`, `local`). | `457f6a5` |
| TM-03 | Contract tests with read-back of every write; metadata repair with a scope; ADR on how known gaps appear in test management. | `457f6a5` |
| PROC-01 | Rules: modes, app packs, registry, generation (locator policy), tagging (one tag per dimension), reporting, documentation, reachability. | `b854691` |
| PROC-03 | Templates: intake (manual exploration notes accepted as a source), UI feature contract with the quality-dimensions checklist, registry with declared dimensions; the cited status of each contract rule. | `b854691` |
| PROC-02 | Skills: `qa-intake`, `qa-design`, `qa-automate`, `qa-publish`, `qa-run`, `qa-report-bug`; `lint-docs` broken-reference, so a path a skill or a rule names exists. | `4530c9b` |
| PROC-04 | `juice-shop-ui` pack skill; `scaffold:app` writes a new pack's skill from the template. | `4530c9b` |
| CORE-15 | `QA_SLOWMO`: milliseconds the browser waits before each action, to watch a headed run; the test timeout grows with it. | `41321bd` |
| CORE-16 | App map with sessions and pack cookies: app.json `cookies` every context starts with (test contexts and the walk), `app:map --actor <role>` walking with the newest state an actor fixture wrote (session storage included) into `docs/app-map.<role>.json`, routes per role under `app_map.actors`, the signed-in email replaced by `<EMAIL>`. | `80d284c` |
| JS-05 | Juice Shop phases 0 and 1: app map, contract docs and registries for sign-up and login, basket and search. | `9302196` |
| GATE-09 | Decision tables: `scripts/lib/decision-table.mjs` reads `apps/<pack>/rules/<case>.yaml` and expands its rules for the spec; `lint-suite` reports a malformed table, a combination no rule covers, two rules that give one combination different actions, and a `decision-table` case without its table. | `9302196` |
| AGT-01 | `spec-author`: writes, runs and reports the specs of an assigned set of approved cases. | `8cd45ad` |
| AGT-02 | `ui-spec-reviewer` with evaluation fixtures: brittle locators, waits, assertions that cannot fail or pass by coincidence, layers, title against body. | `8cd45ad` |
| AGT-03 | `behaviour-investigator`: one requirement against the observed UI, read-only. | `f6b9e06` |
| CORE-17 | `actor(role, { fresh: true })`: an account created for one test, for a case that changes what its account holds, never written over the worker's shared state; `helpers/storage.ts` reads what a page keeps in the browser; `helpers/watch.ts` catches what shows and closes by itself. | `31fbfed` |
| CORE-18 | The run's secrets removed from Playwright's own artifacts (the failure context, traces, the HTML report and the Allure results): workers remember what they learn, and the last reporter redacts every artifact, archives included; each run keeps and forgets its own secrets. | `3775015`, `7af7642` |
| GATE-08 | Lanes: visual, a11y sweep over the app maps per role, mocked, known-gap (with its summary), destructive (one worker, then each pack's recovery) and flake (repetitions without retries), through `scripts/lanes.mjs`. | `d34c717`, `4448890` |
