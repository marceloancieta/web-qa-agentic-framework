---
paths:
  - 'apps/*/registry/**'
  - 'apps/*/docs/features/**'
  - 'docs/templates/registry.md'
  - 'docs/templates/feature-contract.md'
---

# Registries and contracts

A registry is the reviewed list of a feature's designed cases, `apps/<pack>/registry/<feature>.md`,
written from [the template](../../docs/templates/registry.md). People review it as a document and
the tools read it as data. `scripts/lib/registry.mjs` defines the format; `npm run lint:suite` and
`npm run coverage:status` check it.

A feature contract (`apps/<pack>/docs/features/<feature>.md`, from
[its template](../../docs/templates/feature-contract.md)) is what intake learned about the feature.
Its business rules table owns the requirement ids (`scripts/lib/contract.mjs`).

## Feature codes are identities

A case id is `TC-<FEATURE>-NN`. Its identity in results and in test management is
`<pack>-<version>-TC-<FEATURE>-NN` (`helpers/case-meta.ts`).

- **The code never changes once a case is published.** A new code gives every case a new identity,
  and the tool keeps the old ones as orphans beside the new. Fix a title freely; never an id.
- **Name what stays stable**: the user goal or the part of the application (`LOGIN`, `BASKET`,
  `SEARCH`), not a route, a component or a framework name. Routes get renamed, components get split,
  and the goal usually survives both.
- **One code per feature, whatever its size.** Behaviour every page shares (the page health guard,
  the shell's navigation) can have a code of its own; it never takes over a case that a feature's
  registry should own.
- Codes are scoped by the pack's version: the same code in two versions gives two identities.

## Files are containers

Identity comes from the id, not the file, so a registry can be split, merged or renamed. Split one
once a reviewer cannot read it in one sitting, around 25 to 30 cases. Cases that prepare state for
each other stay together. Moving a case changes neither its code nor its number. Several registries
may name the same contract, and its rules may be cited from any of them.

## Header

| Key | Required | Holds |
|---|---|---|
| `feature` | yes | the code |
| `title` | yes | the feature name |
| `routes` | yes | the routes the cases visit, each starting with `/`, as the app map writes them |
| `contract` | no | the feature contract, relative to the pack |
| `actors` | no | the roles the cases act as (`anonymous`, roles from the pack's `actors` in qa-config) |
| `dimensions` | yes | each of the seven UI quality dimensions: `applies`, or `n/a: <why>` |
| `requirements` | no | `{ id: REQ-<FEATURE>-NN, text }`, only for a registry without a contract |
| `test_data` | no | each `<PLACEHOLDER>` the cases use and what it stands for |

Any other key is a finding. Counts and coverage are not header keys; `npm run coverage:status`
computes them, and a number typed by hand goes stale.

## Requirements and the cited status

- **The contract owns its rules.** A registry that names a contract cites the contract's ids in its
  Requirement column and does not declare them again; restating one is a finding.
- **Every rule is cited.** `npm run traceability` reports a contract rule that no case, in any
  registry naming the contract, cites (`uncited-rule`), and a header requirement with no case
  (`uncovered-requirement`). A rule that will not be tested moves from the business rules to the
  contract's out-of-scope section, with the reason.
- **A mock is not the integration.** A requirement or rule covered only by `@mocked` cases is a
  finding (`mocked-only`): a mock shows how the UI handles an answer, not that the application gives
  it.

## Dimensions

The header declares all seven dimensions of architecture section 6b (`responsive`, `perf`,
`security`, `layout`, `navigation`, `a11y`, `content`). A dimension that `applies` needs at least one
case with its tag (`lint-suite` missing-dimension). `n/a` always carries the reason, written so a
reviewer can disagree with it: "n/a: no loading state on these routes", not "n/a: not needed". The
contract's quality checklist is where the reason is worked out.

## Columns

`| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |`

- **Title** is what the case shows, in words a reviewer can check against the screen.
- **Technique** is one of `scripts/lib/registry.mjs` `TECHNIQUES`; **Priority** `high`, `medium` or
  `low`.
- **Tags** are the tags the test will carry, space separated, with exactly one layer tag
  (`.claude/rules/tagging.md`).
- **Devices** is `all`, or `desktop-only: <why>` or `mobile-only: <why>` with the tag of the same
  name, for a real difference in behaviour recorded in the contract.
- **Spec** is the spec file, relative to the pack, once the case is automated.
- **Defect** is the tracker key of a blocked case or of a known gap.

## Statuses

A case moves from `draft` to `approved`, then `automated`, then `published`; `blocked` can stop
it at any step.

| Status | Set by | Means |
|---|---|---|
| `draft` | design | written, not reviewed yet |
| `approved` | the design gate | reviewed; automate starts from these and nothing else |
| `automated` | automate | a spec declares the case and it ran green, or red as an armed known gap |
| `published` | publish | the definition is in test management, read back |
| `blocked` | any phase | the case **cannot run**: the page does not exist yet, or no data can reach the state it needs. The Defect column holds the key that explains it |

- **A red case with a filed defect still runs.** It is a known gap (`@known-gap` with
  `knownGap(key, why)`), it is published and reported, and the Defect column holds its key. Marking
  it `blocked` takes real coverage off the record.
- Statuses move forward. A case that has to go back (its contract changed, its spec was removed)
  returns to `draft` or `approved`, with a line under the table saying why.
- `npm run lint:suite` reports a status that disagrees with the specs (case-without-spec,
  status-behind).

## Before reorganising registries

1. Was any case with this code published? Then cases may move between files; ids may not change.
2. Do the cases still group by feature, and do the cross-references between them still hold?
3. Run `npm run lint:suite`, `npm run traceability` and `npm run coverage:status`.
