---
feature: LOGIN
title: Sign-in
routes: [/#/login, /#/search, /#/register, /#/forgot-password]
contract: docs/features/login.md
actors: [anonymous, customer]
dimensions:
  responsive: applies
  perf: 'n/a: the form shows no loading state; the answer replaces the form in a few ms, and a delayed answer only keeps the page as it is (TC-LOGIN-14 confirms it)'
  security: applies
  layout: applies
  navigation: applies
  a11y: applies
  content: 'n/a: the page shows no text the user wrote back to them'
test_data:
  <EMAIL>: the address of an account the account builder creates for the run
  <UNKNOWN_EMAIL>: an address the builder makes unique per run and never registers
---

# Sign-in cases

Designed from the contract of 2026-10-25. Every rule is cited; G2 (the form stays reachable when
signed in) was accepted by the owner and has no case.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-LOGIN-01 | an account created for the run signs in through the form, lands on /#/search and the account menu shows <EMAIL> | REQ-LOGIN-01 | use-case | high | @smoke | all | published | specs/login/login.spec.ts | |
| TC-LOGIN-02 | <UNKNOWN_EMAIL> gets the alert "Invalid email or password." and the URL stays /#/login | REQ-LOGIN-02 | equivalence-partition | high | @regression @security | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-03 | a wrong password for <EMAIL> gets the same alert as an unknown email, and no session starts | REQ-LOGIN-02 | equivalence-partition | high | @regression @security | all | published | specs/login/login.spec.ts | |
| TC-LOGIN-04 | Log in is enabled only when both fields have a value, walking every combination of rules/TC-LOGIN-04.yaml | REQ-LOGIN-03 | decision-table | medium | @regression @navigation | all | published | specs/login/login.spec.ts | |
| TC-LOGIN-05 | focusing and leaving each empty field shows "Please provide an email address." and "Please provide a password." | REQ-LOGIN-04 | equivalence-partition | medium | @regression | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-06 | the password is masked while typed; Show password reveals it and a second press masks it again | REQ-LOGIN-05 | state-transition | medium | @regression @security | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-07 | the form is filled and sent with the keyboard alone, the focus visible on each control in reading order | REQ-LOGIN-06 | use-case | medium | @regression @a11y @not-webkit | not-webkit: WebKit leaves links out of the Tab order (contract, Responsive differences) | published | specs/login/login.spec.ts | |
| TC-LOGIN-08 | the refusal is announced as an alert, and the page has no axe violation beyond the baseline before and after it | REQ-LOGIN-02 | use-case | medium | @regression @a11y | all | automated | specs/login/login.spec.ts | LOCAL-37 |
| TC-LOGIN-09 | a signed-in session survives a reload: the account menu still shows <EMAIL> | REQ-LOGIN-07 | state-transition | medium | @regression @navigation | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-10 | "Not yet a customer?" opens /#/register and "Forgot your password?" opens /#/forgot-password | REQ-LOGIN-08 | use-case | low | @regression @navigation | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-11 | the login page has no horizontal scroll, in its initial and refused states | REQ-LOGIN-09 | boundary-value | low | @regression @responsive | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-12 | neither the email nor the password appears in the URL or in browser storage after a refused and after a successful login | REQ-LOGIN-01 | error-guessing | high | @regression @security | all | published | specs/login/login.spec.ts | |
| TC-LOGIN-13 | the login page looks as designed | | use-case | low | @regression @visual @layout | all | published | specs/visual/login.spec.ts | |
| TC-LOGIN-14 | a delayed login answer keeps the form as it is, then signs in when the answer arrives | REQ-LOGIN-01 | error-guessing | low | @regression | all | automated | specs/login/login.spec.ts | |
| TC-LOGIN-15 | a server error on the login keeps the visitor on /#/login with a message and no session | REQ-LOGIN-02 | error-guessing | low | @regression @mocked @known-gap | all | published | specs/login/login.spec.ts | LOCAL-19 |

## Notes

- **Techniques.** Partitions of the pair: unknown email, known email with a wrong password, known
  email with its password (TC-LOGIN-01..03). The button's enablement is a decision table of the two
  fields (`rules/TC-LOGIN-04.yaml`, four combinations). The password visibility is a two-state
  transition. The email field has no format check on the client (G1), so there is no partition of
  malformed emails here.
- **Data and writes.** TC-LOGIN-01, -03, -09, -12 and -14 use an account the builder creates; Juice
  Shop cannot remove it, and it goes with the next container restart. TC-LOGIN-02 and -15 create
  nothing. No case is destructive.
- **Results checked through the API.** TC-LOGIN-03 checks that no session started
  (`GET /rest/user/whoami` through the page's context answers no user), not only the alert.
- **Without a requirement.** TC-LOGIN-13 covers the layout dimension (the visual case the contract
  names); the page health guard runs on every case. It is not a business rule.
- **TC-LOGIN-14** settles the contract's assumption A1 with `delay` on `/rest/user/login`, which
  holds the real answer and lets it through, so it is not `@mocked`. If a loading indicator shows,
  perf applies and the case gains `@perf`.
- **Devices.** Every case runs on every device project of the environment (local: desktop Chromium
  and mobile Chrome). The account menu moves at 960 px; `components/account-menu.ts` hides the
  difference, so no case needs a device tag. No case is pairwise: each runs on every project, and
  the `ci` projects cover every browser and form factor pair (`npm run pairwise`).
