---
feature: LOGIN
title: Admin sign-in
routes: [/dashboard/login, /dashboard, /dashboard/<store id>, /dashboard/<store id>/orders, /dashboard/<store id>/settings/staff]
contract: docs/features/login.md
actors: [anonymous, admin, staff]
dimensions:
  responsive: applies
  perf: applies
  security: applies
  layout: applies
  navigation: applies
  a11y: applies
  content: 'n/a: the page shows no text the user typed back to them, and its messages never repeat the email'
test_data:
  <STAFF_EMAIL>: the address of a staff account the case creates through the admin API (a role, an invitation, its acceptance) and removes afterwards
  <UNKNOWN_EMAIL>: an address the builder makes unique per run and never invites
  <STORE_ID>: the store's id, taken from the page a sign-in lands on
---

# Admin sign-in cases

Designed from the contract of 2026-11-10, with its gaps G1 and G2 filed as `LOCAL-45` and
`LOCAL-46` on 2026-11-14. Every rule is cited.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-LOGIN-01 | a staff account created for the case signs in through the form, lands on /dashboard/<STORE_ID> with the heading "Dashboard", and the user menu shows its name | REQ-LOGIN-01 | use-case | high | @smoke | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-02 | "Sign in" with both fields empty shows "Invalid email address" under Email and "Password is required" under Password, marks both fields invalid and sends no sign-in request | REQ-LOGIN-02 | boundary-value | medium | @regression | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-03 | an email without the shape of an address (no `@`, nothing after the `@`, nothing before it) is reported invalid by the browser's own check of the Email field, and no sign-in request is sent | REQ-LOGIN-03 | equivalence-partition | medium | @regression | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-04 | <UNKNOWN_EMAIL> and a wrong password for <STAFF_EMAIL> both get "Invalid email or password", and the page stays on /dashboard/login | REQ-LOGIN-04 | equivalence-partition | high | @regression @security | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-05 | while a delayed sign-in answer is on its way, "Sign in" reads "Signing in…" and is disabled; when it arrives, the dashboard opens | REQ-LOGIN-05 | state-transition | medium | @regression @perf | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-06 | after five wrong passwords for <STAFF_EMAIL>, its right password gets "Account temporarily locked. Try again later." and the page stays on /dashboard/login | REQ-LOGIN-06 | state-transition | high | @regression @security | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-07 | after four wrong passwords for <STAFF_EMAIL>, its right password still signs in | REQ-LOGIN-06 | boundary-value | medium | @regression @security | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-08 | after five wrong passwords for <UNKNOWN_EMAIL>, a sixth gets the same message as a locked account's, so the message does not tell which emails have an account | REQ-LOGIN-04 | error-guessing | medium | @regression @security @known-gap | all | automated | specs/login/login.spec.ts | LOCAL-50 |
| TC-LOGIN-09 | the password is masked while typed: Password has `type=password` and its value is not shown | REQ-LOGIN-07 | use-case | low | @regression @security | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-10 | without a session, /dashboard, /dashboard/<STORE_ID>/orders and /dashboard/<STORE_ID>/settings/staff each lead to /dashboard/login and show none of their data | REQ-LOGIN-08 | equivalence-partition | high | @regression @security | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-11 | "Log out" in the user menu moves to /dashboard/login, and /dashboard/<STORE_ID>/orders opened afterwards leads to the login again | REQ-LOGIN-09 | state-transition | high | @regression @security | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-12 | Back after "Log out", from a dashboard reached through two pages, shows no dashboard data and leaves the visitor signed out | REQ-LOGIN-09 | error-guessing | medium | @regression @navigation | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-13 | Email has the focus when the page opens, Tab reaches Password, "Sign in" and "Forgot password?" in that order with a visible focus, and Enter in Password signs in | REQ-LOGIN-10 | use-case | medium | @regression @a11y @not-webkit | not-webkit: Safari's Tab skips links, so "Forgot password?" is never reached by Tab (contract, responsive differences) | automated | specs/login/login.spec.ts | |
| TC-LOGIN-14 | neither the email nor the password appears in the URL or in browser storage, after a refused and after a successful sign-in | REQ-LOGIN-11 | error-guessing | high | @regression @security | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-15 | a signed-in staff member who reloads /dashboard/<STORE_ID> stays signed in on the same page | REQ-LOGIN-12 | state-transition | medium | @regression @navigation | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-16 | the login page has no horizontal scroll, in its initial, invalid and refused states | REQ-LOGIN-13 | boundary-value | low | @regression @responsive | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-17 | the login page loads with no broken image, failed request, console error or uncaught exception, and the same after a refused sign-in | REQ-LOGIN-04 | error-guessing | low | @regression @layout | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-18 | the login page, in its initial, invalid and refused states, has no axe violation beyond the baseline | REQ-LOGIN-02 | use-case | medium | @regression @a11y | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-19 | the refusal message is announced (an `alert` or `status` role, or a live region) and each field message is tied to its field through `aria-describedby` | REQ-LOGIN-04 | error-guessing | high | @regression @a11y @known-gap | all | automated | specs/login/login.spec.ts | LOCAL-45 |
| TC-LOGIN-20 | Email declares its purpose (`autocomplete` `email` or `username`), Password declares `current-password`, and both are exposed as required | REQ-LOGIN-02 | error-guessing | medium | @regression @a11y @known-gap | all | automated | specs/login/login.spec.ts | LOCAL-46 |

## Notes

- **Accounts.** Every case that signs a member in, fails a member's sign-in or signs out (01, 04 to
  07, 11 to 14) uses a `staff` account of its own, made and removed through the admin API (contract
  A3), so the shared admin is never locked out or signed out. The cases that only need a refusal
  (08, 16 to 19) use <UNKNOWN_EMAIL>, and 02, 03, 09 and 20 send nothing. TC-LOGIN-15 starts
  signed in as `admin`. TC-LOGIN-06 locks its account for 30 minutes; it is removed at the end, so
  no other case meets it.
- **Partitions.** Email: empty (TC-LOGIN-02, the page's message), malformed in three shapes
  (TC-LOGIN-03, the browser's own `type=email` check, revised on 2026-11-14), well formed
  and unknown, well formed and known (TC-LOGIN-04). Password: empty (TC-LOGIN-02), wrong, right.
  Failed attempts: four then the right password (TC-LOGIN-07), five then the right password
  (TC-LOGIN-06).
- **TC-LOGIN-05** delays the real sign-in answer with `delay`; the answer is the application's, so
  the case is not `@mocked`.
- **TC-LOGIN-08** settled gap G3: the unknown email keeps getting "Invalid email or password"
  while a locked account gets the lockout message, filed as `LOCAL-50` (2026-11-14); the case runs
  armed with it.
- **TC-LOGIN-12** settles gap G4: the probe's Back landed on `about:blank` only because the
  dashboard was its first page, so the case reaches the dashboard through two pages first.
- **TC-LOGIN-13** is `not-webkit`: the local environment runs no WebKit project, and in the `ci`
  environment the WebKit projects leave it out for the reason in its Devices cell.
- **TC-LOGIN-17** covers the layout dimension with the page health guard as its subject; a visual
  case of the login waits until the Spree pack has a CI job and baselines.
- **Known gaps.** TC-LOGIN-19 and TC-LOGIN-20 assert what the gaps say should happen and run
  armed with their keys until the issues close.
- **Out of scope** (contract): the password reset, other providers, the first-run setup, the user
  menu's theme, language and profile, and the rate limits.
- No case is pairwise: each runs on every project of the environment.
