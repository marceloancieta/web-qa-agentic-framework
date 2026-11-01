# Contributing

Thank you for helping. This guide covers how a change is prepared, checked and proposed. The rules
any change follows, for people and coding agents alike, are in [`AGENTS.md`](AGENTS.md); this file
does not repeat them.

## Before you start

- **Set up** with [onboarding](docs/onboarding.md): dependencies, the git hooks, gitleaks, and a
  first run.
- **Find or propose the backlog item.** Every change traces to an item of the
  [backlog](docs/backlog.md). For a defect or an idea without one, open an issue first; a security
  problem goes through the [security policy](SECURITY.md) instead, never a public issue.
- **Read the decision behind the part you change.** The [ADRs](docs/adr/README.md) record why things
  are the way they are; a change that goes against one starts with a new ADR.

## Making the change

- **Branch** from `main` as `<type>/<backlog-id>-<short-description>`, for example
  `feat/core-03-actor-fixture` ([ADR 0006](docs/adr/0006-branching-and-traceability.md)).
- **Commit** as `type(scope): <BACKLOG-ID> summary`, with Conventional Commit types.
  `npm run commit:title -- "<title>"` checks a title. Dependency updates by Dependabot are the one
  exception to the backlog id.
- **Keep the layers.** Specs assert, page objects locate and act, and locators follow the
  [locator policy](docs/adr/0007-locator-policy.md); `lint:layers` and `lint:harness` check both.
- **Test every check.** A new linter rule or gate comes with fixtures that contain the defect and
  look-alikes that do not, and its self-test must stay exact.
- **Keep one home per fact.** Link to the file that owns a fact instead of copying it, and update
  what applies a policy in the same commit as the policy
  ([documentation rule](.claude/rules/documentation.md)).
- **No secrets or real data**, anywhere: not in specs, fixtures, docs, commit messages or
  screenshots. Credentials come from the environment, and test data is created by the run.
- **English** for code, comments, file names, docs and commit messages.
- **Test applications responsibly**: only systems you are authorised to test, never production.

## Checking it

```sh
npm run gates
```

The `pre-push` hook runs the same command, so a push never carries a red gate. Show the evidence
when you say something works: the command and its result.

## Proposing it

Open a pull request against `main`:

- its title is the commit title the squash merge will use, in the convention above;
- its description links the backlog item and says what changed, why, and how it was checked;
- CI must pass, and a reviewer approves it before it is merged.

## Conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
