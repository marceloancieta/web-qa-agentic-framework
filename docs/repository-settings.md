# Repository settings

The settings of the GitHub repository that the workflows and [`CONTRIBUTING.md`](../CONTRIBUTING.md)
rely on. They live in GitHub, not in a file, so this page records what they must be; whoever owns
the repository applies them. Rulesets and private vulnerability reporting need a public repository
(or a paid plan on a private one), so they are applied when the repository becomes public.

## Template

**Settings → General → Template repository**: turn it on once the repository is public, so a team
can start its own project with **Use this template** ([adopting the framework](guides/adopting.md)).
The copies take later releases from the `v<x.y.z>` tags, so every release is tagged.

## Pull requests

**Settings → General → Pull Requests**

- Allow squash merging only: clear **Allow merge commits** and **Allow rebase merging**.
- Squash merge default commit message: **Pull request title and description**. The title becomes the
  subject of the commit on `main`, which is why the `title` check holds it to the convention.
- Turn on **Automatically delete head branches**.
- Turn on **Always suggest updating pull request branches**.

## The `main` ruleset

**Settings → Rules → Rulesets → New ruleset → New branch ruleset**

- **Name** `main`, **Enforcement status** Active, **Target branches** the default branch.
- **Restrict deletions**: on.
- **Require linear history**: on.
- **Require a pull request before merging**: on, with **Required approvals** `0` while the
  repository has one maintainer (GitHub does not let an author approve their own pull request), and
  **Allowed merge methods** Squash. Raise the approvals to `1` when a second maintainer joins.
- **Require status checks to pass**: on, with **Require branches to be up to date before merging**,
  and these checks:

  | Check | Workflow | Proves |
  |---|---|---|
  | `required` | [`ci.yml`](../.github/workflows/ci.yml) | every job of the change succeeded: the gates, each shard of the suite, each lane and the report |
  | `title` | [`pr-title.yml`](../.github/workflows/pr-title.yml) | the title follows `type(scope): <BACKLOG-ID> summary` (ADR 0006) |

- **Block force pushes**: on.
- No bypass list: the owner merges through pull requests too.

`required` stands for every other job of `ci.yml`, so a change to the shards or the lanes never
leaves branch protection naming a check that no longer runs. CodeQL is not a required check: it
reports to code scanning, where its alerts are reviewed.

## Security

**Settings → Code security**

- **Private vulnerability reporting**: on, the channel [`SECURITY.md`](../SECURITY.md) names.
- **Dependency graph** and **Dependabot alerts**: on. Dependabot version updates come from
  [`.github/dependabot.yml`](../.github/dependabot.yml).
- **Secret scanning** with **Push protection**: on.
- **Code scanning**: the advanced setup in [`codeql.yml`](../.github/workflows/codeql.yml); leave
  the default setup off, since both would scan the same code.

## Actions

**Settings → Actions → General**

- **Workflow permissions**: **Read repository contents and packages permissions**. Each workflow
  asks for more only where it needs it (CodeQL's `security-events: write`, the advisory review's
  `pull-requests: write` to post its comment).
- **Allow GitHub Actions to create and approve pull requests**: off.

**Settings → Secrets and variables → Actions → New repository secret**

- `ANTHROPIC_API_KEY`, optional: the key the advisory AI review of pull requests uses
  ([`pr-review.yml`](../.github/workflows/pr-review.yml), rubric in
  [`.github/pr-review-rubric.md`](../.github/pr-review-rubric.md)). Without it the review is skipped
  and nothing else changes; it is never a required check. A pull request from a fork gets no secrets,
  so it is skipped too. The model is `claude-opus-5-5` unless the job sets `QA_REVIEW_MODEL`.
  Nothing else in the workflows needs a secret.

## After applying them

Open a pull request with a title that breaks the convention and check that `title` fails and
merging is blocked; fix the title and check that it passes. Then check that a direct push to `main`
is refused.
