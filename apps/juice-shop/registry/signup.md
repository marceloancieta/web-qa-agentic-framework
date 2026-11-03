---
feature: SIGNUP
title: Sign-up
routes: [/#/register, /#/login]
contract: docs/features/signup.md
actors: [anonymous]
dimensions:
  responsive: applies
  perf: 'n/a: the form shows no loading state; the security questions arrive before the form can be completed, and the page has no indicator for them'
  security: applies
  layout: applies
  navigation: applies
  a11y: applies
  content: applies
test_data:
  <EMAIL>: an address the account builder makes unique per run
  <LONG_TEXT>: a text of 200 characters without spaces, from the builder
---

# Sign-up cases

Designed from the contract of 2026-10-25. Every rule is cited. The contract's assumptions A1 (an
email already registered is refused), A2 (where a registration lands) and A3 (what the form sends)
are settled by the first run of TC-SIGNUP-07 and TC-SIGNUP-08 in automate.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-SIGNUP-01 | Register is enabled only when every field is valid, walking every combination of rules/TC-SIGNUP-01.yaml | REQ-SIGNUP-01 | decision-table | high | @regression @navigation | all | published | specs/signup/signup.spec.ts | |
| TC-SIGNUP-02 | an email left empty says "Please provide an email address." and a malformed one "Email address is not valid." | REQ-SIGNUP-02 | equivalence-partition | medium | @regression | all | approved | | |
| TC-SIGNUP-03 | a password of 4 characters shows "Password must be 5-40 characters long."; 5 and 40 characters are accepted | REQ-SIGNUP-03 | boundary-value | high | @regression @content | all | published | specs/signup/signup.spec.ts | |
| TC-SIGNUP-04 | a 41st character typed into the password is not taken: the field keeps 40 | REQ-SIGNUP-03 | boundary-value | medium | @regression @content | all | approved | | |
| TC-SIGNUP-05 | a repeated password that differs says "Passwords do not match"; once equal, the message goes | REQ-SIGNUP-04 | equivalence-partition | medium | @regression | all | approved | | |
| TC-SIGNUP-06 | the question list offers the questions of the application; leaving it or the answer empty shows their messages | REQ-SIGNUP-05 | equivalence-partition | medium | @regression | all | approved | | |
| TC-SIGNUP-07 | a visitor registers <EMAIL> through the form, and the new account signs in with that email and password | REQ-SIGNUP-06 | use-case | high | @smoke | all | published | specs/signup/signup.spec.ts | |
| TC-SIGNUP-08 | registering <EMAIL> a second time is refused with a message, and the second password does not sign in | REQ-SIGNUP-07 | error-guessing | high | @regression | all | published | specs/signup/signup.spec.ts | |
| TC-SIGNUP-09 | both password fields are masked while typed | REQ-SIGNUP-08 | equivalence-partition | medium | @regression @security | all | approved | | |
| TC-SIGNUP-10 | nothing typed into the form appears in the URL or in browser storage, before or after registering | REQ-SIGNUP-08 | error-guessing | medium | @regression @security | all | published | specs/signup/signup.spec.ts | |
| TC-SIGNUP-11 | an email that carries markup is refused or shown back as text, and the page creates no element from it | REQ-SIGNUP-02 | error-guessing | medium | @regression @security | all | approved | | |
| TC-SIGNUP-12 | the form is filled with the keyboard alone, the security question included, the focus visible in reading order | REQ-SIGNUP-09 | use-case | medium | @regression @a11y | all | approved | | |
| TC-SIGNUP-13 | each field message is tied to its field, and the page has no axe violation beyond the baseline with the messages shown | REQ-SIGNUP-09 | use-case | medium | @regression @a11y | all | approved | | |
| TC-SIGNUP-14 | "Already a customer?" opens /#/login | REQ-SIGNUP-10 | use-case | low | @regression @navigation | all | approved | | |
| TC-SIGNUP-15 | the registration page has no horizontal scroll, empty and with every message shown | REQ-SIGNUP-11 | boundary-value | low | @regression @responsive | all | approved | | |
| TC-SIGNUP-16 | <LONG_TEXT> as the email and as the answer stays inside its field | REQ-SIGNUP-11 | boundary-value | low | @regression @content | all | approved | | |
| TC-SIGNUP-17 | when the security questions fail to load, the list is empty and Register stays disabled | REQ-SIGNUP-05 | error-guessing | low | @regression @mocked | all | published | specs/signup/signup.spec.ts | |
| TC-SIGNUP-18 | the empty registration form looks as designed | | use-case | low | @regression @visual @layout | all | approved | | |
| TC-SIGNUP-19 | the counter under the password field shows the field's limit, /40 | REQ-SIGNUP-03 | boundary-value | low | @regression @content @known-gap | all | published | specs/signup/signup.spec.ts | LOCAL-4 |

## Notes

- **Partitions and boundaries.** Email: empty, malformed, valid, already registered, with markup,
  very long. Password length: 4, 5, 40 and a 41st character (the field's `maxlength` keeps 40, so
  41 is checked as "not taken"); 0 is the empty partition of the decision table. Repeat: equal or
  different. Question: chosen or not. Answer: empty, given, very long.
- **Decision table.** `rules/TC-SIGNUP-01.yaml` crosses the five fields (48 combinations, 7 rules);
  each invalid field alone keeps Register disabled. The messages of each field are their own cases
  (TC-SIGNUP-02..06), so the table checks only the button.
- **Data and writes.** TC-SIGNUP-07, -08 and -10 register accounts through the form, and -11 may
  (when the application accepts the address). Juice Shop cannot remove an account; they go with the
  next container restart. Every address comes from the builder, unique per run. No case is
  destructive.
- **Results checked through the API.** TC-SIGNUP-07 signs the new account in through `api/`, not
  only through the page it lands on; TC-SIGNUP-08 checks that the second password is refused by
  `POST /rest/user/login`.
- **The counter.** G1 (the counter reads `/20`) is LOCAL-4 (S3): TC-SIGNUP-19 runs as a known gap,
  while TC-SIGNUP-03 and -04 check what the field takes.
- **Without a requirement.** TC-SIGNUP-18 covers the layout dimension (the visual case the contract
  names).
- **Devices.** Every case runs on every device project of the environment; the contract records no
  difference in the form. No case is pairwise: each runs on every project, and the `ci` projects
  cover every browser and form factor pair (`npm run pairwise`).
