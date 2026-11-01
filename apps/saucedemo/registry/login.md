---
feature: LOGIN
title: Sign-in
routes: [/, /inventory.html]
contract: docs/features/login.md
actors: [anonymous, standard, locked-out]
dimensions:
  responsive: applies
  perf: 'n/a: the check runs in the page with no loading state; the delay of performance_glitch_user is in drawing the product list, which the inventory registry covers'
  security: applies
  layout: applies
  navigation: applies
  a11y: applies
  content: 'n/a: the page shows no text the user wrote back to them, and the messages never repeat the user name'
test_data:
  <STANDARD_USER>: the user name of the standard actor, read from the environment
  <LOCKED_OUT_USER>: the user name of the locked-out actor, read from the environment
  <UNKNOWN_USER>: a user name made unique per run that the application does not accept
  <WRONG_PASSWORD>: a password generated for the run, never the accepted one
---

# Sign-in cases

Designed from the contract of 2026-10-31. Every rule is cited. The gaps G1, G3, G6 and G7 have no
case of their own: they wait for `qa-report-bug`, and G2 is checked by TC-LOGIN-09.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-LOGIN-01 | <STANDARD_USER> signs in through the form, lands on /inventory.html and sees the product list | REQ-LOGIN-01 | use-case | high | @smoke | all | automated | specs/login/login.spec.ts |  |
| TC-LOGIN-02 | Login with both fields empty shows the alert "Epic sadface: Username is required", marks both fields and stays on / | REQ-LOGIN-02 | equivalence-partition | medium | @regression | all | automated | specs/login/login.spec.ts |  |
| TC-LOGIN-03 | Login with <STANDARD_USER> and an empty password shows "Epic sadface: Password is required" and stays on / | REQ-LOGIN-03 | equivalence-partition | medium | @regression | all | automated | specs/login/login.spec.ts |  |
| TC-LOGIN-04 | <UNKNOWN_USER> with the accepted password and <STANDARD_USER> with <WRONG_PASSWORD> get the same message, "Epic sadface: Username and password do not match any user in this service", stay on / and get no session | REQ-LOGIN-04 | equivalence-partition | high | @regression @security | all | automated | specs/login/login.spec.ts |  |
| TC-LOGIN-05 | <LOCKED_OUT_USER> with the accepted password is refused with "Epic sadface: Sorry, this user has been locked out.", stays on /, and /inventory.html then sends back to / | REQ-LOGIN-05 | equivalence-partition | high | @regression @security | all | automated | specs/login/login.spec.ts |  |
| TC-LOGIN-06 | "Dismiss error" removes the alert and the error marks on both fields | REQ-LOGIN-06 | state-transition | low | @regression | all | automated | specs/login/login.spec.ts |  |
| TC-LOGIN-07 | the password field masks what is typed (type=password) | REQ-LOGIN-07 | equivalence-partition | medium | @regression @security | all | automated | specs/login/login.spec.ts |  |
| TC-LOGIN-08 | /inventory.html opened without a session sends the visitor to / with "Epic sadface: You can only access '/inventory.html' when you are logged in." | REQ-LOGIN-08 | equivalence-partition | high | @regression @security | all | automated | specs/login/login.spec.ts |  |
| TC-LOGIN-09 | the form is filled and sent with the keyboard alone: Tab reaches Username, Password and Login in that order, each with a visible focus, and Enter signs in | REQ-LOGIN-09 | use-case | medium | @regression @a11y @known-gap | all | automated | specs/login/login.spec.ts | LOCAL-26 |
| TC-LOGIN-10 | Logout in the menu returns to /; Back and /inventory.html opened afterwards both lead to / again | REQ-LOGIN-10 | state-transition | high | @regression @security @navigation | all | automated | specs/login/login.spec.ts |  |
| TC-LOGIN-11 | neither the user name nor the password appears in the URL after a refused and after a successful login | REQ-LOGIN-11 | error-guessing | high | @regression @security | all | automated | specs/login/login.spec.ts |  |
| TC-LOGIN-12 | the login page has no horizontal scroll, in its initial and refused states | REQ-LOGIN-12 | boundary-value | low | @regression @responsive | all | automated | specs/login/login.spec.ts |  |
| TC-LOGIN-13 | the refusal is announced as an alert, and the page has no axe violation beyond the baseline before and after it | REQ-LOGIN-02 | use-case | medium | @regression @a11y | all | automated | specs/login/login.spec.ts |  |
| TC-LOGIN-14 | the login page looks as designed |  | use-case | low | @regression @visual @layout | all | automated | specs/visual/login.spec.ts |  |

## Notes

- **Techniques.** Partitions of the pair: both empty, a user name with an empty password, an unknown
  user name, a known user name with a wrong password, the locked-out user, the accepted pair
  (TC-LOGIN-01..05). The page checks nothing else on the client, so there are no boundaries of
  length. The error goes through three states (none, shown, dismissed), TC-LOGIN-06.
- **Third party.** TC-LOGIN-04 and -05 submit a refused login, which the application reports with
  the typed user name to its error-reporting host (contract G4). Their specs block that host, like
  every case of the pack, so nothing leaves the run.
- **Data.** The pack writes nothing anywhere: the session is a cookie in the case's own context, and
  the accounts are the demo's own. `<UNKNOWN_USER>` and `<WRONG_PASSWORD>` come from builders.
  No case is destructive.
- **Actors.** `locked-out` is new: SD-01c adds it to qa-config with `SAUCEDEMO_LOCKED_OUT_USER`
  (contract A2). TC-LOGIN-05 types its user name through the form, so it needs only the variables.
- **Script sources.** REQ-LOGIN-01, -03, -04, -05 and -10 came from the application's script
  (contract A3); their cases are the first look at them in a running page.
- **G2.** TC-LOGIN-09 checks that each control shows focus; if it does not, the case becomes a known
  gap once `qa-report-bug` files G2.
- **Without a requirement.** TC-LOGIN-14 covers the layout dimension with the visual case; the page
  health guard runs on every case.
- **Devices.** Every case runs on every device project of the environment (local: desktop Chromium
  and mobile Chrome). The pack has no breakpoints, and the form is the same at every width.
