# Backlog

Open work for the framework. This file holds **active work only**: a finished row moves to the
**Done** section at the end with its closing commit and keeps its id forever, so references in
commits and docs stay valid. The design behind the items is in [`architecture.md`](architecture.md).

- Commits follow the ADR 0006 message convention (`type(scope): ID summary`), one stage or item each.
- **Status** is one of `todo` · `in-progress` · `blocked`. A row that will not be done moves to
  **Done** like a finished one, its item starting with `**Won't do.**` and the reason.
- **Origin**: `exp` = an established engineering practice for repositories, CI and releases;
  `practice` = an established testing practice (ISTQB, OWASP, WCAG, testing literature); `plan` = the framework's own roadmap;
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
| DOC-02 | W9 | Read-only documentation review before the release. It also removes the temporary "What arrives when" table from `CLAUDE.md`, reduces architecture section 8 to one line on what is shared with the sibling API framework, and moves architecture section 9 to `docs/lessons-learned.md` or drops it, so the public docs describe how the framework works, not how it was built. The backlog rows and the lessons describe technical work only, with no personal notes, comments about third parties or hints of where a lesson came from (the denylist scan catches names and hosts, not tone). The whole git history is read the same way before the repository becomes public, and the first commits are squashed into one if their messages or contents need it. The documentation review is done (`6a1ac9a`); the history review remains, on the owner's machine. | exp | in-progress |
| CI-04 | W9 | The Jenkinsfile proven on a real Jenkins, on a Windows agent and on a Linux agent in WSL: an `AGENT_LABEL` parameter (empty means any agent) instead of a fixed label, `sh` or `bat` by agent, the suite shards one after another on one Docker engine, a browser install without system packages for an agent without administrator rights, a Node stage that checks the version and that npm runs on the same platform, JUnit published, no concurrent builds, `reports/` emptied at the start; the private repository read through a credential the owner creates in Jenkins. | plan | todo |
| DOC-05 | W9 | GitHub Flow once the repository is public: `main` takes pull requests only, squash merges, a linear history, no force push, the CI jobs as required checks and a check that the pull-request title follows the commit convention; `CONTRIBUTING.md` describes it. The files are done (`c02e192`): the title check, the `required` job, `CONTRIBUTING.md` and `docs/repository-settings.md`; the settings themselves remain, applied by the owner on GitHub once the repository is public. | exp | in-progress |
| TM-04 | W9 | The `allure-testops` adapter proven on a real Allure TestOps, in a project of its own: the automated cases published there, then a run reported from a local machine and one from Jenkins (CI-04), with the token read from the environment or a Jenkins credential. | plan | todo |
| DOC-03 | W9 | CHANGELOG and tag `v0.1.0`: `npm run changelog` writes a Keep a Changelog section per version from the commit titles, and `npm run release:check` runs the checks before a tag in order and stops at the first failure (a clean tree, `main` up to date, the gates, the changelog section, the version); the GitHub repository and any publishing only with the owner's approval. The scripts are done (`release:check` in `37034b3`); the release commit (version and changelog section) and the tag remain, the owner's. | plan | in-progress |
| CORE-19 | W9 | Two failures that come and go in CI made diagnosable or less likely. The page health guard describes an error object a page logs (Angular's `ERROR` and an `HttpErrorResponse`) by its fields, written in the page when it is logged, since a console message named it `Dr` in WebKit and `JSHandle@object` in Firefox (TC-CHECKOUT-20 on `main@c02e192` and PR #4). A visual comparison waits for every image in view to finish loading, naming any that does not (TC-BASKET-20 on WebKit, `main@76a41e2`, 6% of its pixels apart and stable). The cause of each is confirmed on the owner's machine with Juice Shop, from the next failure's report. | practice | in-progress |

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
| FUT-03 | Web vitals (LCP, CLS, INP) with per-pack budgets, and a Lighthouse lane. | practice | todo |
| FUT-04 | i18n: projects per `locale` and `timezoneId`, pseudo-localization, right-to-left. | practice | todo |
| FUT-05 | Design-token checks from the pack's `design-tokens.json`; `prefers-reduced-motion` emulation. | plan | todo |
| FUT-06 | Security headers per response and a ZAP baseline lane against the UI. | practice | todo |
| FUT-07 | TOTP two-factor login and a mail-catcher pattern (Mailpit). | plan | todo |
| FUT-08 | `qa-explore` skill for chartered exploratory sessions, after an ADR decides its mode. | plan | todo |
| FUT-09 | Extract a shared core with the sibling API framework once both are stable. | plan | todo |
| FUT-11 | App map drift: a scheduled job maps each pack again and compares the result with the tracked `app-map.json`, so a changed route, role, name or form constraint is reported before the specs fail on it. | plan | todo |
| FUT-12 | Publishing `create-web-qa` from a `v<x.y.z>` tag through npm trusted publishing (OIDC, no token) with provenance, then a read-back with `npm create` outside the repository. | practice | todo |
| FUT-16 | `cited-status`: the known gaps, waiting claims and workarounds the registries and contracts cite are checked against the tracker, and a closed or unknown key is reported. | plan | todo |

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
| CI-01 | Project matrix with `--shard` and the `blob` report (`QA_BLOB_REPORT=1`), `npm run ci:merge`, a quality gate over the suite and the lanes that refuses another run's report, one `QA_RUN_ID` per run, report to test management; the first run on the six projects of the `ci` environment fixed. | `f47f5a0`, `f573cd2` |
| CI-02 | GitHub Actions workflow and a Jenkinsfile that only call the npm scripts: gates, the suite in four shards, the a11y, visual and destructive lanes, the merged report with the quality gate and the report to test management, the flake lane weekly; baselines for the six device projects of the `ci` environment. | `c92da8a`, `6b695c0`, `720e51c` |
| JS-06 | Juice Shop phases 2 to 4 for a representative sample: 55 cases of login, sign-up, basket, search, checkout and the journeys automated and reviewed, the visual cases with baselines on six device projects, published to test management and run with a report, locally and in CI. | `79d8df3`, `f73a71a`, `75df5d5`, `db7795c`, `d34c717`, `c83ee32` |
| JS-07 | Juice Shop checkout: intake from an observed walk (address, delivery, payment, summary, completion, history) with its gaps filed, the checkout and journey registries, and the purchase journey from the login form to the order in the history. | `efb7a59`, `f5ec183`, `79d8df3` |
| PROC-05 | End-to-end journeys as a capability of their own: a journey registry per pack whose rules chain the rules of several features, the `@e2e` tag the lanes and CI select, and the generation rules for a journey. | `1c2a64f` |
| SD-01 | SauceDemo pack, read-only: sign-in by the session cookie and the cart by local storage, 45 cases of login, product list and cart automated on desktop Chromium and mobile Chrome, `visual_user` proved to differ from the baseline, `performance_glitch_user` for anti-flake, `locked_out_user`, five defects armed as known gaps, published and run with a report. It runs in the local environment only. | `d9d4bfd`, `4218a42`, `18a766d`, `9a3885d` |
| GATE-10 | `lint-docs` rule `closing-commit`: every hash a **Done** row cites names a commit in the history of `HEAD`. | `52825ee` |
| CI-03 | CodeQL and `npm audit` clean; full-history scans (gitleaks, denylist, banned wording); Dependabot for npm and the GitHub Actions, with a cooldown of 14 days before a new version is proposed. | `dac5b15` |
| DOC-01 | README, onboarding and guides. The README separates what the framework offers ("What you get": a table of capabilities such as the five gated phases, device projects, accessibility with a baseline, visual regression in a container, network mocking, adapters, skills, hooks and agents) from what it is built with ("Built with": Node, Playwright, TypeScript, axe, Docker, Allure), keeps badges to license, Node and Playwright (CI once the repository is on GitHub), and adds a table of contents when it grows past about six sections. | `bc88072` |
| DOC-04 | Community files before publishing. `SECURITY.md`: report through GitHub private vulnerability reporting, never a public issue; scope (a vulnerability of an application under test, such as the deliberately vulnerable Juice Shop, belongs to that application's project, not this one); what the framework does to keep secrets out (secret-guard, gitleaks and the denylist, redaction of traces, HAR files and screenshots, `.auth/` ignored); responsible use (only the systems qa-config names and the tester is authorized to test, never production); supported versions (before 1.0, only the latest). `CONTRIBUTING.md`. `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), once the owner chooses its contact channel. | `6cddc1f` |
| CI-05 | The GitHub workflows run on the local machine with `act` before a push that changes them: `.actrc` (the runner image, one job at a time, the host network where Juice Shop answers at its CI URL), artifact steps skipped under `act`, and the tests that keep both true. | `76a41e2` |
| GATE-11 | The settle check of the accessibility sweep is tested on a clock it controls: `untilSteady` decides on what the readings return, never on how fast they come, and its unit test drives the page's timers with `page.clock`, so the test gives the same result on a loaded machine and no longer spends the whole 15-second wait on a page that never settles. The sweep itself still reads every second for up to 15 seconds. | `78c42ba` |
| FUT-15 | Mutation testing with Stryker over `scripts/lib` and `.claude/hooks/lib`, on demand (`npm run mutation`, one run per library), its score read by the quality gate against qa-config `quality_gate.mutation`. The first runs gave 69.5% together (REVIEW). | `925c596` |
| FUT-10 | Pairwise over browser × form factor × role (`scripts/lib/pairwise.mjs`, `scripts/lib/run-matrix.mjs`): a `pairwise` environment (`ci`) must realize every browser × form factor pair of the catalog (config:check), `npm run pairwise` spreads each pack's roles over its projects, and a registry lists the runs of its pairwise cases under `pairwise`, checked by `lint-suite` pairwise-gap. In a pairwise environment the a11y sweep runs each role only on the projects the set gives it. | `1c18553`, `eadca61` |
| FUT-13 | The repository as a GitHub template: the adoption guide (`docs/guides/adopting.md`) from **Use this template** to a green CI, `npm run framework:update -- --to v<x.y.z>` (the product diff between two release tags, applied with a three-way merge, the release recorded in `.web-qa.json`) and `npm run remove:app -- --name <pack>`; what is product is `scripts/lib/product.mjs`. Turning on "Template repository" waits for the public repository. | `6b3c1dd` |
| FUT-02 | `npm create web-qa@<version> <dir>` (package `create-web-qa`, built by `npm run create:pack`): the generated project gets the product and none of the framework's development records, whose links point at the framework's repository at the release tag; it records its release for `framework:update`, and a test lists what the package ships. Publishing is FUT-12. | `a15f23e` |
| FUT-14 | Advisory AI review of pull requests (`npm run review:pr`, `.github/workflows/pr-review.yml`): only on `pull_request`, skipped without the `ANTHROPIC_API_KEY` secret (the owner adds it; `docs/repository-settings.md`), one comment updated on each push, against `.github/pr-review-rubric.md`, whose "Left to the gates" section a test keeps equal to the gates. | `449a21a` |
| CI-06 | "Re-run failed jobs" stays one run: `QA_RUN_ID` in GitHub Actions is the run id without the attempt, so the quality gate takes the re-run shards beside the lanes' reports of the first attempt instead of refusing them as another run's. | `c3defba` |
