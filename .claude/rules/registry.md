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
| `kind` | no | `feature`, the default, or `journey` (below) |
| `actors` | no | the roles the cases act as (`anonymous`, roles from the pack's `actors` in qa-config) |
| `pairwise` | no | the runs the cases were designed for, `<device project> as <role>`; required when a case's technique is `pairwise`. `lint-suite` pairwise-gap reports a run that names an unknown project or a role outside `actors`, and a pair of browser, form factor and role no run covers; `npm run pairwise` proposes a set |
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

## Tracker keys

A key a pack cites stands for something that waits on the tracker: a known gap in the Defect column
or in a spec's arm, a gap in the contract's table, a rule "the application breaks", a workaround
"until `<KEY>` is fixed", a departure in the app notes, a known accessibility violation. When the
issue closes, what cites it may no longer be true.

- `npm run cited-status` reads every cited key in the configured tracker, read-only, and reports a
  key whose issue is closed (`closed-key`: the gap may be fixed, so the case, the claim or the
  workaround is revisited) or that the tracker does not have (`unknown-key`). What counts as a
  citation depends on the file:

  | In each pack | A citation is |
  |---|---|
  | `registry/*.md`, `docs/features/*.md`, `docs/app-notes.md` | a match of qa-config `tracker.key_pattern` on its own, outside code spans, code blocks and HTML comments |
  | `specs/**/*.spec.ts` | the first argument of a `knownGap(...)` call, from the syntax tree; a key in a comment, in a string or in a `test.fail` reason of its own does not count |
  | `a11y-known.json`, `headers-known.json`, `zap-known.json` | the `key` field of an entry; a key mentioned in another field does not count |

- In a spec and in a baseline the position says the value is a key, so one that does not match the
  pattern is an `unknown-key` without asking the tracker. A `knownGap` key that comes from an
  expression cannot be read at all, which is a finding of its own (`dynamic-key`): write it in the
  call.
- The gates run it with `--offline`: it checks a tracker kept in the repository (`local`) and skips
  one that needs the network. A tracker reached over the network is read with `--online` once a week
  ([`cited-status.yml`](../../.github/workflows/cited-status.yml), and the weekly Jenkins build),
  which skips a `local` one with that reason, and by `qa-run` after a run.
- A closed key is never fixed by deleting it. The known-gap lane shows whether the case now passes;
  the case, the contract and the arm then change through `qa-design` and `qa-automate`.

## Journeys

A journey is what a user does from end to end across features: sign in, find a product, buy it,
see the order. Its cases prove that the features work together, which no feature's registry can, so
they have a registry of their own.

- **One journey registry per pack**, `kind: journey`, with its own code (`JOURNEY`) and a contract
  of its own (`apps/<pack>/docs/features/journeys.md`, from the feature contract template). Each of the
  contract's rules is one end-to-end outcome, and its Source cites the feature rules it chains
  (`REQ-LOGIN-01`, `REQ-CHECKOUT-09`); `lint-suite` journey-chain reports a rule that cites none, or
  one no other contract of the pack has.
- **Every case carries `@e2e`** and one layer tag, and no feature case carries `@e2e` (`lint-suite`
  journey-tag).
- **Few, and only what features cannot show.** A journey proves the hand-over between features; the
  rules of each step stay with the feature's cases. A detail a journey would check (a message, a
  boundary, a state) belongs in the feature's registry. Keep one to three journeys per pack.
- **Its dimensions** are usually `n/a`, each saying which feature registry covers it; a journey that
  checks one (the keyboard through the whole purchase) declares it and tags the case.

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
- **Devices** is `all`, or `desktop-only: <why>`, `mobile-only: <why>` or `not-webkit: <why>` with
  the tag of the same name, for a real difference in behaviour recorded in the contract.
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
