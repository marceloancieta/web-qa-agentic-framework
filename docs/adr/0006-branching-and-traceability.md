# 0006 - Branching model and change traceability

**Status:** Accepted (2026-10-24); amended (2026-11-01, CI-03) with the dependency-update exception;
amended (2026-11-02, DOC-02) with the history kept until the repository is public

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

**Until the repository is public:** commits go to `main` after the gates pass, one or a few per
roadmap stage (W0 to W9) or backlog item, following the commit convention below. Work done on a
branch in parallel is merged with `--no-ff`, never squashed, because the **Done** rows it adds cite
its commits by hash; the merge commit keeps git's own subject.

**Once the repository is public:** GitHub Flow (DOC-05). `main` is protected and always green;
branches are short-lived and squash-merged.

| Element | Convention |
|---|---|
| Commit | `type(scope): <BACKLOG-ID>... summary`, Conventional Commit types, one or more backlog ids, e.g. `feat(core): CORE-03 actor fixture with an injected session` |
| Branch | `<type>/<backlog-id>-<short-description>`, e.g. `feat/core-03-actor-fixture` |
| Pull request | Same title as the squash commit; the body links the backlog item; CI must pass |
| Release | Tag `vX.Y.Z` on `main`; `CHANGELOG.md` built from the history by `npm run changelog` |
| Backlog | A finished item moves to **Done** with the hash of the commit that closed it |

**Dependency updates** proposed by Dependabot are the one exception to the backlog id: a bot cannot
name a backlog item, so `build(deps): …`, `build(deps-dev): …` and `ci(deps): …` pass without one
(`DEPENDENCY_UPDATES` in `scripts/changelog.mjs`), and the changelog lists them without ids.

`npm run commit:title -- "<title>"` checks a subject with the same parser that builds the changelog.
`git-policy` can enforce part of this from qa-config: `tracker.key_pattern` for the ids,
`policies.commit.conventional_commits` and `policies.commit.protected_branches`.

## Consequences

- Each commit names the backlog item it serves, so the history is traceable from the first commit;
  the merge commits of parallel branches are the only subjects without an id.
- The history scans (secrets, denylist, wording) run before every push (the `pre-push` hook), so
  nothing reaches the remote without passing them.
