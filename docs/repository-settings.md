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
reports to code scanning, where its alerts are reviewed. Neither is the weekly app map drift
([`app-map-drift.yml`](../.github/workflows/app-map-drift.yml)): the application can change without
a change to the repository. Nor is the weekly reading of the cited keys
([`cited-status.yml`](../.github/workflows/cited-status.yml)), for the same reason: an issue can
close without one. With a `jira` tracker it needs the repository secrets `JIRA_USER` and
`JIRA_TOKEN`; a tracker kept in the repository, or a `github` one on this repository, needs no
secret.

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
  `pull-requests: write` to post its comment, the publish job's OIDC token).
- **Allow GitHub Actions to create and approve pull requests**: off.

**Settings → Secrets and variables → Actions → New repository secret**

- `ANTHROPIC_API_KEY`, optional: the key the advisory AI review of pull requests uses
  ([`pr-review.yml`](../.github/workflows/pr-review.yml), rubric in
  [`.github/pr-review-rubric.md`](../.github/pr-review-rubric.md)). Without it the review is skipped
  and nothing else changes; it is never a required check. A pull request from a fork gets no secrets,
  so it is skipped too. The model is `claude-opus-5-5` unless the job sets `QA_REVIEW_MODEL`.
  Nothing else in the workflows needs a secret.

## Publishing

[`publish.yml`](../.github/workflows/publish.yml) publishes `create-web-qa` when a `vX.Y.Z` tag is
pushed ([releasing](../CONTRIBUTING.md#releasing)). It uses npm trusted publishing: npm trusts that
workflow file through GitHub's OIDC token, so no npm token is stored, and each version carries a
provenance statement naming the repository, the workflow and the tagged commit. Set up once:

- **On GitHub**, **Settings → Environments → New environment** `npm`: the owner as required
  reviewer, and a deployment rule that allows only tags matching `v*`. Approving the deployment is
  the moment of publishing.
- **On npm**, in the package's settings, **Trusted publishing**: a publisher of type GitHub Actions
  with this repository's owner and name, the workflow `publish.yml` and the environment `npm`. Tick
  **Allow npm publish**; without it the publisher may only stage a version, and the job fails with
  `403 ... OIDC permission denied for this action`. Leave **Allow npm dist-tag** unticked.
- npm configures a trusted publisher only on a package that exists, so its first version is published
  by hand by the owner. A new package published by hand goes through npm's staged publishing: npm
  creates it with a placeholder version `0.0.0-stage`, which no one else can publish (a plain
  `npm publish` of that version is refused with `403`), and the version staged beside it waits for
  the owner's approval on npm. Once a version has been published by the workflow, set the package's
  publishing access to require two-factor authentication and disallow tokens.
- npm warns that **Allow npm publish** is weaker than leaving it unticked, which lets the publisher
  only stage a version for the owner's approval on npm. The workflow publishes directly, after the
  approval of the `npm` environment; staged publishing is backlog CI-09.
- The job installs a pinned npm (trusted publishing needs 11.5.1 or later; Node 22 bundles 10).
  Dependabot does not read that pin: update it by hand to a release at least two weeks old, with the
  command the test in `scripts/__tests__/create-publish.test.mjs` expects.

A repository created from the framework keeps the workflow, but the job runs only in the repository
the package names, so a copy's tags skip it and GitHub never creates the environment there.

## After applying them

Open a pull request with a title that breaks the convention and check that `title` fails and
merging is blocked; fix the title and check that it passes. Then check that a direct push to `main`
is refused.
