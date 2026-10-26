# Agent guide

Instructions for any coding agent working in this repository. Claude Code reads them through
[`CLAUDE.md`](CLAUDE.md), which adds what is specific to Claude Code.

## What this repository is

A framework for testing web user interfaces: phase-gated test design, Playwright and TypeScript
execution across browsers and devices, test-management and tracker adapters, and the process that
connects them. Each application under test is an **app pack** in `apps/<pack>/`; the core never
imports a pack. Read [`docs/architecture.md`](docs/architecture.md) for the design,
[`docs/adr/`](docs/adr/README.md) for the decisions and [`docs/backlog.md`](docs/backlog.md) for
what is built and what is next. The repository is being built stage by stage (W0 to W9 in the
backlog); parts named below that do not exist yet arrive in the stage the backlog gives them.

## The process

Work on an application moves through phases. Each phase produces an artifact a person reviews
before the next phase starts.

| Phase | Produces | Mode | Skill |
|---|---|---|---|
| 0 intake | `apps/<pack>/docs/features/<feature>.md`, the feature contract | design | `qa-intake` |
| 1 design | `apps/<pack>/registry/<feature>.md`, the reviewed cases | design | `qa-design` |
| 2 automate | specs, pages, components, flows, mocks and visual baselines that ran as designed | design | `qa-automate` |
| 3 publish | case definitions in the test-management tool | design | `qa-publish` |
| 4 run | a reported run | execution | `qa-run` |

**Design and execution never mix:**

- Design navigates and reads the application, plus the pack's login. It submits no forms and creates
  no accounts outside a spec run.
- Execution never edits specs, registries, definitions or visual baselines.

A request that needs both is split, and each half stops at its own gate.

## Rules that apply to every change

- **Gates.** `npm run gates` must pass before a push; the `pre-push` hook runs it (installed by
  `npm run hooks:install`). It runs lint, format, type and configuration checks, the hook, script
  and core unit tests, the QA linters (`lint:layers`, `lint:harness`, `lint:docs`) with their
  self-tests, and the denylist and secret scans.
- **No secrets or real data.** Credentials come from the environment or the local `.env`, never from
  arguments, specs or docs. Browser sessions stay under `.auth/`, which git ignores.
- **Layers and locators.** Specs assert, page objects locate and act (ADR 0005); locators follow
  the policy of ADR 0007.
- **Checks are tested.** A new linter rule comes with fixtures that contain the defect and
  look-alikes that do not.
- **Language.** Code, comments, file names, docs and commit messages are in English. Conversation
  follows the user's language.
- **Commits** follow `type(scope): <BACKLOG-ID> summary` (ADR 0006). Pushing, creating a remote
  repository and publishing anything outside the machine need the owner's approval.

## Where to look

| For | Read |
|---|---|
| the design and the reasons behind it | [`docs/architecture.md`](docs/architecture.md) |
| recorded decisions | [`docs/adr/README.md`](docs/adr/README.md) |
| open work, stages and acceptance criteria | [`docs/backlog.md`](docs/backlog.md) |
| the rules each phase follows | [`.claude/rules/`](.claude/rules/modes.md), starting with the modes |
| how each phase is carried out, and the facts of each pack | [`.claude/skills/`](.claude/skills/qa-intake/SKILL.md), one `SKILL.md` per phase and per pack; a defect found in either mode goes through `qa-report-bug` |
| the intake request, feature contract, registry and pack skill formats | [`docs/templates/`](docs/templates/feature-contract.md): [intake](docs/templates/intake.md), [feature contract](docs/templates/feature-contract.md), [registry](docs/templates/registry.md), [pack skill](docs/templates/pack-skill.md) |
| the agents that write specs, review them and investigate a requirement, each with its limits | [`.claude/agents/`](.claude/agents/spec-author.md), listed in [`CLAUDE.md`](CLAUDE.md) |
| the Claude Code hooks | [`.claude/hooks/README.md`](.claude/hooks/README.md) |
