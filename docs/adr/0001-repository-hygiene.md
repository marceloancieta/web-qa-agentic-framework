# 0001 - Repository hygiene: secret scanning and a local denylist

**Status:** Accepted (2026-10-24)

## Context

The repository is meant to become public, and the people who work on it also test private systems
for employers and clients. Two kinds of text must never land in it: secrets (tokens, keys,
passwords, session files) and private identifiers (product and company names, internal hosts and
addresses, issue keys, people's names). A UI framework adds its own risks: browser sessions written
to disk, traces and HAR files that record what was typed and every request made. A reviewer misses
these sooner or later, and anything pushed can be cached or indexed even after it is deleted.

## Decision

Both scanners run from the first commit, so the history never needs to be rewritten.

- **gitleaks** checks the staged changes in `.githooks/pre-commit` and the whole history with
  `npm run scan:secrets`. When gitleaks is missing the scan fails instead of passing quietly.
- A **local denylist** holds the terms a contributor must never publish. It lives in
  `.git/info/denylist`, a folder git does not version, so the list cannot be committed by mistake.
  `scripts/scan-denylist.mjs` checks staged content and paths, commit messages (`commit-msg`), the
  tracked tree (`npm run scan:denylist`, part of the gates) and the full history before a release.
- Generated session state (`.auth/`), test output and reports are ignored by git.
- `npm run hooks:install` enables the git hooks once per clone.

## Consequences

- A clone without a denylist sees a notice and passes: it has nothing private to protect.
- Each contributor keeps their own denylist; CI can only run gitleaks.
- Evidence that leaves the machine (traces, HAR files, screenshots) still needs redaction at the
  source; the scanners are the last line, not the only one.
