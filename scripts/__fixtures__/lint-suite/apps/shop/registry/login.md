---
feature: LOGIN
title: Sign-in
routes: [/#/login]
contract: docs/features/login.md
actors: [anonymous, customer]
dimensions:
  responsive: 'n/a: the form has one column at every width'
  perf: maybe # expect-finding: registry-shape
  security: applies
  layout: 'n/a: covered by the visual cases of the shell'
  navigation: applies
  a11y: applies # expect-finding: missing-dimension
  content: 'n/a: no user text is shown back'
requirements: # expect-finding: registry-shape
  - { id: REQ-LOGIN-01, text: A registered account signs in with its email and password }
  - { id: REQ-LOGIN-02, text: A wrong password gets a message that does not say which part was wrong }
  - { id: REQ-LOGIN-12, text: Declared here as well as in the contract }
test_data:
  <EMAIL>: an address the builder makes unique per run
---

# Sign-in cases

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-LOGIN-01 | signs in with a fresh account | REQ-LOGIN-01 | use-case | high | @smoke @security | all | automated | specs/login.spec.ts | |
| TC-LOGIN-02 | a wrong password is refused generically | REQ-LOGIN-02 | error-guessing | high | @regression @security | all | automated | specs/login.spec.ts | |
| TC-LOGIN-03 | Back after logout shows no account data | REQ-LOGIN-11 | state-transition | medium | @regression @navigation | all | approved | | |
| TC-LOGIN-04 | the tab order reaches the submit button | REQ-LOGIN-01 | use-case | low | @regression @navigation | all | automated | specs/missing.spec.ts | | <!-- expect-finding: case-without-spec -->
| TC-LOGIN-05 | the hamburger opens the account | REQ-LOGIN-01 | use-case | low | @regression @navigation @mobile-only | mobile-only: the toolbar hides the account below 960 px | approved | | | <!-- expect-finding: status-behind -->
| TC-LOGIN-06 | remember me keeps the session | REQ-LOGIN-03 | use-case | low | @regression | all | approved | | | <!-- expect-finding: registry-shape -->
| TC-LOGIN-07 | a desktop shortcut | REQ-LOGIN-01 | use-case | low | @regression @desktop-only | all | approved | | | <!-- expect-finding: registry-shape -->
| TC-LOGIN-08 | blocked until the defect is fixed | REQ-LOGIN-01 | use-case | low | @regression | all | blocked | | | <!-- expect-finding: registry-shape -->
| TC-LOGIN-09 | automated in a file that has no such test | REQ-LOGIN-01 | use-case | low | @regression | all | published | specs/login.spec.ts | | <!-- expect-finding: case-without-spec -->
| TC-LOGIN-01 | the same id twice | REQ-LOGIN-01 | use-case | low | @regression | all | draft | | | <!-- expect-finding: registry-shape -->
| TC-LOGIN-10 | too few cells | REQ-LOGIN-01 | use-case | low | <!-- expect-finding: registry-shape -->
