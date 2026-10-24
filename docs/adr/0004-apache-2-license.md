# 0004 - Apache License 2.0

**Status:** Accepted (2026-10-24)

## Context

The framework is meant for QA teams inside companies and for outside contributions, and it shares
code with its sibling API framework, which is licensed under Apache-2.0. Legal reviews in adopting
organizations look for a permissive license with clear patent terms.

## Decision

License the project under the Apache License 2.0 from the first commit, with a `NOTICE` file.
Compared with MIT it adds an explicit patent grant with a retaliation clause, and its section 5 puts
contributions under the same license without a separate agreement. It is the sibling's license, so
code moves between the two without a relicensing question.

## Consequences

- Redistributors keep `LICENSE` and `NOTICE` and mark the files they change.
- Third-party material a pack bundles (an application's documents, images, sample data) is credited
  in `NOTICE` with its own license when it is added.
