# 0006 - Branching model and change traceability

**Status:** Accepted (2026-10-24)

## Context

Every change should lead back to the backlog item that asked for it and forward to the release that
shipped it. The project has one line of releases, runs its gates in CI once it has a remote, and
will take outside contributions through GitHub. Until the first push it lives on one machine, built
stage by stage.

GitFlow suits several supported versions and scheduled releases; here it would add long-lived
branches with nothing to gain. Pure trunk-based work leaves no place for CI results and review to
attach to a change. GitHub Flow gives each change a pull request with its CI run and review, and is
what contributors expect.

## Decision

**Before the first push:** one local commit per roadmap stage (W0 to W9) on `main`, after the gates
pass, following the commit convention below.

**From the first push:** GitHub Flow. `main` is protected and always green; branches are short-lived
and squash-merged.

| Element | Convention |
|---|---|
| Commit | `type(scope): <BACKLOG-ID>... summary`, Conventional Commit types, one or more backlog ids, e.g. `feat(core): CORE-03 actor fixture with an injected session` |
| Branch | `<type>/<backlog-id>-<short-description>`, e.g. `feat/core-03-actor-fixture` |
| Pull request | Same title as the squash commit; the body links the backlog item; CI must pass |
| Release | Tag `vX.Y.Z` on `main`; `CHANGELOG.md` built from the history by `npm run changelog` |
| Backlog | A finished item moves to **Done** with the hash of the commit that closed it |

`npm run commit:title -- "<title>"` checks a subject with the same parser that builds the changelog.
`git-policy` can enforce part of this from qa-config: `tracker.key_pattern` for the ids,
`policies.commit.conventional_commits` and `policies.commit.protected_branches`.

## Consequences

- The history reads as one commit per stage, then one per backlog item, each traceable.
- The history scans (secrets, denylist, wording) run before the first push, so it is published as
  it was written.
