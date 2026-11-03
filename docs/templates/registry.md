# Registry template

The file the `qa-design` skill writes for each feature, at `apps/<pack>/registry/<feature>.md`.
The format is defined in `scripts/lib/registry.mjs` and explained in
[the registry rule](../../.claude/rules/registry.md); `npm run lint:suite` checks every registry.
Copy the example below and replace its content. A test parses this example, so it stays valid.

- **Header.** `feature`, `title`, `routes` and all seven `dimensions` are required. Name the
  feature contract in `contract`, and cite its business rule ids in the Requirement column; use
  `requirements` only when the feature has no contract.
- **Journeys.** A registry of end-to-end journeys across features adds `kind: journey`, and each of
  its cases carries `@e2e` (the registry rule's Journeys section).
- **Dimensions.** Copy the verdicts of the contract's quality dimensions table: `applies`, or
  `n/a: <why>`. Each dimension that applies needs a case with its tag.
- **Cases.** One row per case, with every column, even the empty ones. Exactly one layer tag. Devices
  is `all` unless the contract records a real difference. New cases start as `draft`.
- **Notes.** Free text may follow the table: the techniques used and why, the partitions and
  boundaries, why the pairwise runs are enough, open questions for the reviewer. The runs
  themselves go in the front matter, under `pairwise` (the registry rule).

```markdown
---
feature: LOGIN
title: Sign-in
routes: [/#/login]
contract: docs/features/login.md
actors: [anonymous, customer]
dimensions:
  responsive: applies
  perf: 'n/a: the form shows no loading state; the answer replaces it at once'
  security: applies
  layout: 'n/a: covered by the visual case of the login page'
  navigation: applies
  a11y: applies
  content: 'n/a: the form shows no text the user wrote'
test_data:
  <EMAIL>: an address the account builder makes unique per run
---

# Sign-in cases

Partitions of the email field: empty, without `@`, valid. The password field has no client-side
rule besides `required`.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-LOGIN-01 | a registered account signs in and sees its email in the account menu | REQ-LOGIN-01 | use-case | high | @smoke | all | draft | | |
| TC-LOGIN-02 | a wrong password gets the same message as an unknown email | REQ-LOGIN-02 | equivalence-partition | high | @regression @security | all | draft | | |
| TC-LOGIN-03 | the submit button stays disabled until both fields have a value | REQ-LOGIN-03 | decision-table | medium | @regression @navigation | all | draft | | |
| TC-LOGIN-04 | the form is reachable and usable with the keyboard alone | REQ-LOGIN-04 | use-case | medium | @regression @a11y | all | draft | | |
| TC-LOGIN-05 | the login page has no horizontal scroll at any width | REQ-LOGIN-05 | boundary-value | low | @regression @responsive | all | draft | | |
```
