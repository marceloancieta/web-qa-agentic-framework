---
feature: ITEM
title: Items
routes: [/items, /items/new]
dimensions:
  responsive: 'n/a: fixture'
  perf: 'n/a: fixture'
  security: 'n/a: fixture'
  layout: 'n/a: fixture'
  navigation: 'n/a: fixture'
  a11y: 'n/a: fixture'
  content: 'n/a: fixture'
requirements:
  - { id: REQ-ITEM-01, text: An item can be created with only its name }
  - { id: REQ-ITEM-02, text: A stored item can be read back by id }
  - { id: REQ-ITEM-03, text: Item names longer than the limit are refused }
---

Fixture registry: one row per lifecycle situation the manifest and the runner must recognize.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-ITEM-01 | Draft with no test yet | REQ-ITEM-01 | equivalence-partition | high | @smoke | all | draft |  |  |
| TC-ITEM-02 | Approved but already written |  | boundary-value | medium | @regression | all | approved |  |  |
| TC-ITEM-03 | Automated in the named file | REQ-ITEM-01 | equivalence-partition | high | @smoke | all | automated | specs/items.spec.ts |  |
| TC-ITEM-04 | Automated in a file that does not exist |  | error-guessing | low | @regression | all | automated | specs/missing.spec.ts |  |
| TC-ITEM-05 | Automated twice in one file |  | equivalence-partition | medium | @regression | all | automated | specs/items.spec.ts |  |
| TC-ITEM-06 | Automated but written in another file |  | use-case | medium | @regression | all | automated | specs/items.spec.ts |  |
| TC-ITEM-07 | Automated but parked with fixme |  | state-transition | low | @regression | all | automated | specs/items.spec.ts |  |
| TC-ITEM-08 | Published and present in the run | REQ-ITEM-02 | use-case | high | @smoke | all | published | specs/items.spec.ts |  |
| TC-ITEM-09 | Published but missing from the run | REQ-ITEM-02 | decision-table | medium | @regression | all | published | specs/items.spec.ts |  |
| TC-ITEM-10 | Blocked and skipped with its key |  | error-guessing | medium | @regression | all | blocked | specs/items.spec.ts | BUG-10 |
| TC-ITEM-11 | Blocked with a malformed key |  | error-guessing | low | @regression | all | blocked |  | later |
| TC-ITEM-12 | Blocked but the test is not armed |  | error-guessing | low | @regression | all | blocked | specs/items.spec.ts | BUG-12 |
| TC-ITEM-13 | Blocked but passing in the run |  | pairwise | low | @regression | all | blocked | specs/items.spec.ts | BUG-13 |
| TC-ITEM-14 | Automated without a spec |  | boundary-value | low | @regression | all | automated |  |  |
| TC-ITEM-15 | Automated with a tracked known gap |  | boundary-value | medium | @regression | all | automated | specs/items.spec.ts | BUG-15 |
| TC-ITEM-16 | Published in a second spec |  | use-case | medium | @regression | all | published | specs/other.spec.ts |  |
