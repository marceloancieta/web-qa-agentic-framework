# Web QA Agentic Framework

[![CI](https://github.com/marceloancieta/web-qa-agentic-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/marceloancieta/web-qa-agentic-framework/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933.svg)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/playwright-1.64-2EAD33.svg)](https://playwright.dev/)

A framework for testing web user interfaces with Playwright and TypeScript, driven by a five-phase
process (intake, design, automate, publish, run) with a human review gate after each phase, and
Claude Code skills, rules, hooks and agents that carry the process. It is the sibling of
[api-qa-agentic-framework](https://github.com/marceloancieta/api-qa-agentic-framework).

## Contents

- [What you get](#what-you-get)
- [Built with](#built-with)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [App packs](#app-packs)
- [Documentation](#documentation)
- [Status](#status)
- [License](#license)

## What you get

| Capability | What it gives you | Read more |
|---|---|---|
| Five gated phases | Intake, design, automate, publish and run, each ending at a review gate; design and execution never mix | [the process](AGENTS.md#the-process), [modes](.claude/rules/modes.md) |
| Traceable cases | Feature contracts with business rules, registries of reviewed cases with ids, a linter for the suite and a traceability report | [registry rule](.claude/rules/registry.md), [templates](docs/templates/feature-contract.md) |
| Device projects | Desktop Chromium, Firefox and WebKit, tablet, mobile Chrome and Safari, and landscape variants; each environment picks its own | [devices and selectors](docs/architecture.md#2-devices-and-selectors) |
| Layered tests | Specs assert, page objects and components locate and act, flows chain steps; a linter keeps the layers and the locator policy | [ADR 0005](docs/adr/0005-layered-ui-test-architecture.md), [ADR 0007](docs/adr/0007-locator-policy.md) |
| Accessibility | axe on every page a case visits, with a per-pack baseline of known violations that expire; keyboard and focus helpers | [visual regression and accessibility](docs/architecture.md#3-visual-regression-and-accessibility) |
| Visual regression | Screenshots compared in a pinned container, so a baseline never depends on the machine that took it | [ADR 0009](docs/adr/0009-container-lanes.md) |
| State injection and network mocking | Actors start signed in without the login screen; mocked answers, failures, delays and offline pages | [state injection and network mocking](docs/architecture.md#4-state-injection-and-network-mocking) |
| Lanes | Visual, accessibility sweep, mocked, known-gap, destructive and flake runs, each with what it needs before and after | [running tests](docs/guides/running-tests.md#lanes) |
| Evidence without secrets | Traces, screenshots, HAR files and reports redacted; a page health guard on every test | [repository hygiene](docs/adr/0001-repository-hygiene.md) |
| Adapters | Test management (Allure TestOps, Allure Report, local) and trackers (Jira, GitHub, local), chosen in configuration | [test management and trackers](docs/test-management.md) |
| Claude Code | One skill per phase, rules as guardrails, hooks that enforce them, agents for isolated reviews | [working with Claude Code](docs/guides/working-with-claude-code.md) |
| Gates | Lint, format, types, configuration, the QA linters and their self-tests, and scans of the whole history before every push | [the gates](AGENTS.md#rules-that-apply-to-every-change) |
| CI without lock-in | GitHub Actions and Jenkins call the same npm scripts; sharded runs, merged reports and a quality gate | [CI](docs/architecture.md#5-ci-that-does-not-depend-on-a-vendor-and-the-browser-matrix) |

## Built with

- [Node.js](https://nodejs.org/) and [TypeScript](https://www.typescriptlang.org/)
- [Playwright Test](https://playwright.dev/)
- [axe-core](https://github.com/dequelabs/axe-core) through `@axe-core/playwright`
- [Docker](https://www.docker.com/) for the local applications and the visual lane
- [Allure](https://allurereport.org/) for results and reports

## Quick start

```sh
npm ci
npx playwright install chromium   # the browser the core's unit tests and the default projects use
npm run hooks:install             # secret scan and denylist before each commit, gates before each push
npm run gates
```

Then start Juice Shop and run its smoke cases:

```sh
npm run juice-shop:up
npx playwright test --project='juice-shop-*' --grep @smoke
```

[Onboarding](docs/onboarding.md) takes you from a fresh clone to a first run and a first phase,
with the problems that most often stop a first run.

## How it works

Each application under test is an **app pack** in `apps/<pack>/`, and the core never imports a pack.
Work on a pack moves through five phases: a feature contract, a registry of reviewed cases, the
specs, the published case definitions, and a reported run. Each phase is a Claude Code skill that
ends by showing what it produced and waiting for approval. The process, the artifacts and the
skills are in [`AGENTS.md`](AGENTS.md); the design and the reasons behind it are in
[`docs/architecture.md`](docs/architecture.md).

## App packs

| Pack | Application | Runs |
|---|---|---|
| [`juice-shop`](apps/juice-shop/README.md) | OWASP Juice Shop, a deliberately insecure shop, in a local container; the worked example of every part of the framework | locally and in CI |
| [`saucedemo`](apps/saucedemo/README.md) | The public Swag Labs demo shop, tested read-only | locally |

[Adding an app pack](docs/guides/adding-an-app-pack.md) shows how to bring in another application.

## Documentation

| For | Read |
|---|---|
| a first run and a first phase | [Onboarding](docs/onboarding.md) |
| running suites, tags, lanes and reports | [Running tests](docs/guides/running-tests.md) |
| bringing in another application | [Adding an app pack](docs/guides/adding-an-app-pack.md) |
| the phases, skills, agents and hooks in practice | [Working with Claude Code](docs/guides/working-with-claude-code.md) |
| the rules any change follows, and where everything lives | [`AGENTS.md`](AGENTS.md) |
| the design and the reasons behind it | [Architecture](docs/architecture.md) |
| recorded decisions | [ADRs](docs/adr/README.md) |
| test management and trackers | [Test management and trackers](docs/test-management.md) |
| what is built and what is next | [Backlog](docs/backlog.md) |
| proposing a change | [Contributing](CONTRIBUTING.md) |
| the GitHub settings the workflows rely on | [Repository settings](docs/repository-settings.md) |
| reporting a vulnerability, privately | [Security policy](SECURITY.md) |
| how everyone taking part behaves | [Code of conduct](CODE_OF_CONDUCT.md) |

## Status

Before v0.1.0. The stages and what each one delivers are in the [backlog](docs/backlog.md).

## License

[Apache License 2.0](LICENSE). See [`NOTICE`](NOTICE).
