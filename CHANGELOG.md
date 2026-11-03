# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), and each section is generated from the
commit history by `scripts/changelog.mjs`.

## [0.2.0] - 2026-11-03

### Features

- **ci:** advisory AI review of pull requests (FUT-14) `449a21a`
- **core:** pairwise over browser, form factor and role (FUT-10) `1c18553`
- **core:** the a11y sweep follows the pairwise set (FUT-10) `eadca61`
- **gate:** mutation testing of the libraries, judged by the quality gate (FUT-15) `925c596`
- **template:** adopting the framework from the template, updates and pack removal (FUT-13) `6b3c1dd`
- **template:** the create-web-qa package (FUT-02) `a15f23e`

### Fixes

- **ci:** CodeQL has no open alert (#5) (CI-07) `c623788`
- **template:** the update tests keep their line endings on Windows (FUT-13) `16f8d87`
- **template:** the package tests let mutation testing start (FUT-02) `de045b1`
- **visual:** the basket title stays on one line in visual comparisons (#4) (CORE-20) `2b24c58`

### Other

- **ci(deps):** Node's typings stay on the Node major the project supports (#6) (CI-08) `cd40a34`
- **ci(release):** create-web-qa is published from a release tag with npm trusted publishing (#7) (FUT-12) `99bd43f`
- **docs(backlog):** the advisory AI review is done (FUT-14) `d895bdf`
- **docs(backlog):** the done row cites the sweep commit (FUT-10) `a9d9c80`
- **docs(backlog):** the changelog and the v0.1.0 tag are done (DOC-03) `c16cd09`
- **docs(backlog):** GitHub Flow on the public repository is done (#3) (DOC-05) `a11cd0c`

## [0.1.0] - 2026-11-02

### Features

- **ci:** sharded blob reports, ci:merge and a quality gate that refuses another run's report (CI-01) `f47f5a0`
- **core:** qa-config, device projects, preflight and layer linter (CORE-01, CORE-02, CORE-10, CORE-11, GATE-01) `12b64de`
- **core:** actors, accessibility, visual, network, evidence and page health fixtures (CORE-03..09) `58a7a83`
- **core:** scaffold:app, read-only app map, and the login page in the session probe (CORE-12..14) `5e8e527`
- **core:** QA_SLOWMO to watch a headed run (CORE-15) `41321bd`
- **core:** fresh actors, browser storage and watching for what must not appear (CORE-17) `31fbfed`
- **core:** the run's secrets removed from Playwright's own artifacts (CORE-18) `3775015`
- **gate:** mocked, known-gap, destructive, flake and a11y sweep lanes (GATE-08) `4448890`
- **gate:** lint-docs closing-commit rule (GATE-10) `52825ee`
- **gates:** harness and docs linters with the public-wording rule (GATE-02, GATE-04) `672badc`
- **gates:** registry format, suite linter, coverage status and traceability (GATE-03, GATE-05) `a05be7e`
- **gates:** quality gate and the visual lane in the pinned Playwright image (GATE-06, GATE-07) `ed0acfa`
- **juice-shop:** Juice Shop pack with sign-in smoke on desktop and mobile (JS-01..04) `b267400`
- **juice-shop:** intake of login, sign-up, basket and search, with signed-in maps (JS-05, CORE-16) `80d284c`
- **juice-shop:** registries of login, sign-up, basket and search, with decision tables (JS-05, GATE-09) `9302196`
- **juice-shop:** checkout intake from an observed walk, its gaps filed (JS-07) `efb7a59`
- **juice-shop:** checkout and journey registries, approved (JS-07) `f5ec183`
- **juice-shop:** journeys and a checkout sample automated, reviewed and run (JS-06) `79d8df3`
- **juice-shop:** blocks for the login, sign-up, basket and search sample (JS-06) `f73a71a`
- **juice-shop:** blocks the login, sign-up and search authors asked for (JS-06) `75df5d5`
- **juice-shop:** login, sign-up, basket and search sample automated and reviewed (JS-06) `db7795c`
- **juice-shop:** visual cases for login, search, basket and order completion (JS-06) `d34c717`
- **proc:** rules, templates and the cited status of contract rules (PROC-01, PROC-03) `b854691`
- **proc:** phase skills, the juice-shop-ui pack skill and checked references (PROC-02, PROC-04) `4530c9b`
- **proc:** spec-author, ui-spec-reviewer and behaviour-investigator agents (AGT-01, AGT-02, AGT-03) `f6b9e06`
- **proc:** evaluation fixtures for ui-spec-reviewer, measured on a first run (AGT-02) `8cd45ad`
- **proc:** end-to-end journeys as a capability of their own (PROC-05) `1c2a64f`
- **release:** release:check runs the checks before a tag (DOC-03) `37034b3`
- **saucedemo:** the pack with cookie sign-in, app maps and three feature contracts (SD-01) `d9d4bfd`
- **tm:** test-management and tracker adapters with read-back, devices and known gaps (TM-01..03) `457f6a5`
- **tm:** the allure-testops adapter publishes case definitions before a run (TM-04) `30a13fa`

### Fixes

- **ci:** the visual lane reaches Juice Shop on the compose network and shares the run id (CI-02) `6b695c0`
- **ci:** a re-run of failed jobs stays one run for the quality gate (CI-06) `c3defba`
- **core:** each run keeps and forgets its own secrets (CORE-18) `7af7642`
- **core:** the sweep's settle check is tested on a clock it controls (GATE-11) `78c42ba`
- **core:** the guard names logged errors, and screenshots wait for images (CORE-19) `1d330c8`
- **core:** the page health guard excuses the error a page logs for a request it cancelled (CORE-19) `fbd4248`
- **core:** the delayed answer unit test sees the loading indicator on a busy machine (CORE-19) `b10f9ed`
- **juice-shop:** first ci-environment run: WebKit fixes, @not-webkit, reset connections retried (CI-01) `f573cd2`
- **proc:** reviewer fixtures follow what W8 learned, measured again (AGT-02) `e26f88e`
- **release:** release:check runs the gates on Windows (DOC-03) `9046aab`
- **tm:** a known gap is uploaded to TestOps with the manifest's status (TM-04) `867f9f5`
- **tm:** a report to TestOps leaves the published test case as it was (TM-04) `fc4d4fa`
- **tm:** a run started within minutes of the one before is reported on its own (TM-04) `50b5c13`

### Other

- **chore(juice-shop):** 55 cases published and the first reported run (JS-06) `c83ee32`
- **chore(release):** version 0.1.0 and its changelog section (DOC-03) `566bc90`
- **chore(repo):** bootstrap repository, safety gates and agent guides (REPO-01) `678ffb6`
- **ci(ci):** GitHub Actions workflow and Jenkinsfile that only call the npm scripts (CI-02) `c92da8a`
- **ci(github):** CodeQL, npm audit, history scans and Dependabot (CI-03) `dac5b15`
- **ci(github):** GitHub Flow, required checks and pull-request titles (DOC-05) `c02e192`
- **ci(github):** the workflows run on the local machine with act (CI-05) `76a41e2`
- **ci(jenkins):** the Jenkinsfile runs on a Windows or a Linux agent (CI-04) `7db44f5`
- **ci(jenkins):** a build reports its run to Allure TestOps when it names the token's credential (TM-04) `010b328`
- **docs(adr):** the history as it is kept until the repository is public (DOC-02) `8ea81fc`
- **docs(backlog):** done, the first green CI run (CI-02) `2500082`
- **docs(backlog):** W8 closed with JS-07 and PROC-05 (JS-06) `92a4608`
- **docs(backlog):** the Jenkinsfile proven on a real Jenkins (CI-04) `489faf1`
- **docs(backlog):** the TestOps adapter proven on a real TestOps (TM-04) `6b72dc8`
- **docs(backlog):** release hygiene for W9 and later work in v0.2.0 (DOC-05) `15c8f73`
- **docs(backlog):** the SauceDemo pack is done (SD-01) `18a250c`
- **docs(backlog):** the deterministic settle check is done (GATE-11) `c656bb5`
- **docs(backlog):** one run id across re-runs is done (CI-06) `8e67900`
- **docs(backlog):** the local act runs are done (CI-05) `4806f9c`
- **docs(backlog):** the Jenkinsfile proven on Windows and Linux agents is done (CI-04) `daba3b3`
- **docs(backlog):** the intermittent page health and visual failures diagnosed is done (CORE-19) `d153f9a`
- **docs(backlog):** the documentation and history review before the release is done (DOC-02) `69fbde3`
- **docs(backlog):** the allure-testops adapter proven on a real Allure TestOps is done (TM-04) `80d0abe`
- **docs(community):** security policy, contributing guide and code of conduct (DOC-04) `6cddc1f`
- **docs(readme):** README, onboarding and guides (DOC-01) `bc88072`
- **docs(review):** documentation review before the release (DOC-02) `6a1ac9a`
- **test(juice-shop):** visual baselines for firefox, webkit, tablet and mobile-safari (CI-02) `720e51c`
- **test(saucedemo):** registries for sign-in, product list and cart (SD-01) `4218a42`
- **test(saucedemo):** specs of sign-in, product list and cart, five defects armed (SD-01) `18a766d`
- **test(saucedemo):** the 45 cases published and run with a report (SD-01) `9a3885d`
- **test(tm):** the adapter contract self-test asks the child runner for TAP (TM-01) `b4e6c85`
