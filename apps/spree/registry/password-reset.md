---
feature: PWRESET
title: Admin password reset
routes: [/dashboard/forgot-password, /dashboard/reset-password, /dashboard/login, /dashboard/<store id>]
contract: docs/features/password-reset.md
actors: [anonymous, staff]
dimensions:
  responsive: applies
  perf: 'n/a: "Send reset link" and "Reset password" answer at once on the local Spree and the probe saw no waiting state; the delay of the mail is the mail job''s, not something the page shows'
  security: applies
  layout: applies
  navigation: applies
  a11y: applies
  content: 'n/a: neither page shows text the user typed back to them, and the confirmation never repeats the email'
test_data:
  <STAFF_EMAIL>: the example.test address of a staff account the case creates through the admin API (a role, an invitation, its acceptance) and removes afterwards; its mail is read from the mail catcher
  <UNKNOWN_EMAIL>: an example.test address the builder makes unique per run and never invites
  <NEW_PASSWORD>: a password the run generates and knows, 8 characters or more; <PASSWORD_7> and <PASSWORD_8> are generated with exactly 7 and 8 characters
  <RESET_LINK>: the "Reset Password" link of the newest "Password Reset Instructions" email to <STAFF_EMAIL>
  <MADE_UP_TOKEN>: a token-shaped value the run makes, which Spree never issued
  <STORE_ID>: the store's id, taken from the page a reset lands on
---

# Admin password reset cases

Designed from the contract of 2026-11-25, with its gaps filed as LOCAL-67, LOCAL-68 and LOCAL-69 and
added to LOCAL-45 and LOCAL-46 on the same day. Every rule is cited.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-PWRESET-01 | /dashboard/forgot-password shows the heading "Reset your password", Email with the focus and "Send reset link", and "Back to sign in" leads to /dashboard/login | REQ-PWRESET-01 | use-case | medium | @sanity @navigation | all | automated | specs/password-reset/forgot.spec.ts | |
| TC-PWRESET-02 | "Send reset link" with Email empty shows "Invalid email address" under it, marks it invalid and sends no reset request | REQ-PWRESET-02 | boundary-value | medium | @regression | all | automated | specs/password-reset/forgot.spec.ts | |
| TC-PWRESET-03 | "Send reset link" for <STAFF_EMAIL> replaces the form with "Check your email", the sentence and "Back to sign in", and one "Password Reset Instructions" email reaches <STAFF_EMAIL> with a "Reset Password" link | REQ-PWRESET-03 | use-case | high | @smoke | all | automated | specs/password-reset/forgot.spec.ts | |
| TC-PWRESET-04 | "Send reset link" for <UNKNOWN_EMAIL> shows the same confirmation as for <STAFF_EMAIL>, and once the staff member's email has arrived, none has reached <UNKNOWN_EMAIL> | REQ-PWRESET-04 | equivalence-partition | high | @regression @security | all | automated | specs/password-reset/forgot.spec.ts | |
| TC-PWRESET-05 | <RESET_LINK>, opened as the email gives it, shows "Choose a new password" with "New password" focused | REQ-PWRESET-05 | use-case | high | @regression @known-gap | all | automated | specs/password-reset/reset.spec.ts | LOCAL-67 |
| TC-PWRESET-06 | a staff member asks for a reset, opens <RESET_LINK>, types <NEW_PASSWORD> twice and lands signed in on /dashboard/<STORE_ID> with the heading "Dashboard"; afterwards <NEW_PASSWORD> signs in and the old password is refused | REQ-PWRESET-08 | use-case | high | @smoke @security | all | automated | specs/password-reset/reset.spec.ts | |
| TC-PWRESET-07 | "Reset password" with "New password" empty and with <PASSWORD_7> twice shows "Password must be at least 8 characters", marks the field invalid and sends no request; <PASSWORD_8> twice is accepted and the dashboard opens | REQ-PWRESET-06 | boundary-value | medium | @regression | all | automated | specs/password-reset/reset.spec.ts | |
| TC-PWRESET-08 | "Reset password" with two different passwords shows "Passwords do not match" under "Confirm new password", marks it invalid and sends no request | REQ-PWRESET-07 | equivalence-partition | medium | @regression | all | automated | specs/password-reset/reset.spec.ts | |
| TC-PWRESET-09 | <RESET_LINK>, opened again after it changed the password, shows the form, and "Reset password" says "Password reset token is invalid or has expired." and stays on the page; the password set by the first use still signs in | REQ-PWRESET-09 | state-transition | high | @regression @security | all | automated | specs/password-reset/reset.spec.ts | |
| TC-PWRESET-10 | of two links sent to <STAFF_EMAIL>, the newer one changes the password, and then the older one is refused with "Password reset token is invalid or has expired." | REQ-PWRESET-09 | state-transition | high | @regression @security | all | automated | specs/password-reset/reset.spec.ts | |
| TC-PWRESET-11 | /dashboard/reset-password with <MADE_UP_TOKEN> shows the form, and "Reset password" with a valid pair says "Password reset token is invalid or has expired." and stays on the page | REQ-PWRESET-10 | error-guessing | medium | @regression @security | all | automated | specs/password-reset/reset.spec.ts | |
| TC-PWRESET-12 | /dashboard/reset-password without a token shows "Invalid reset link", "This password reset link is missing its token." and "Request a new reset link", which leads to /dashboard/forgot-password | REQ-PWRESET-11 | use-case | medium | @regression @navigation | all | automated | specs/password-reset/reset.spec.ts | |
| TC-PWRESET-13 | "New password" and "Confirm new password" both mask what is typed: `type=password`, and the typed value is not shown | REQ-PWRESET-12 | use-case | low | @regression @security | all | automated | specs/password-reset/reset.spec.ts | |
| TC-PWRESET-14 | a session the staff member opened before the reset can no longer renew itself after it, while the session the reset opened can | REQ-PWRESET-13 | state-transition | high | @regression @security | all | automated | specs/password-reset/reset.spec.ts | |
| TC-PWRESET-15 | on the forgot page Email has the focus, Tab reaches "Send reset link" and "Back to sign in" in that order with a visible focus, and Enter in Email sends the request | REQ-PWRESET-14 | use-case | medium | @regression @a11y @not-webkit | not-webkit: Safari's Tab skips links, so "Back to sign in" is never reached by Tab (login contract, responsive differences) | automated | specs/password-reset/forgot.spec.ts | |
| TC-PWRESET-16 | on the reset page "New password" has the focus, Tab reaches "Confirm new password" and "Reset password" in that order with a visible focus, and Enter in "Confirm new password" submits | REQ-PWRESET-14 | use-case | medium | @regression @a11y | all | automated | specs/password-reset/reset.spec.ts | |
| TC-PWRESET-17 | neither <STAFF_EMAIL> nor the password appears in the URL or in browser storage after "Send reset link" and after the reset, and once the reset is done the URL no longer holds the token | REQ-PWRESET-15 | error-guessing | high | @regression @security | all | automated | specs/password-reset/quality.spec.ts | |
| TC-PWRESET-18 | neither page scrolls sideways: the forgot page in its initial, invalid and sent states, the reset page in its initial, invalid, refused and missing-token states | REQ-PWRESET-16 | boundary-value | low | @regression @responsive | all | automated | specs/password-reset/quality.spec.ts | |
| TC-PWRESET-19 | both pages load with no broken image, failed request, console error or uncaught exception, in the sent state and with a refused token too | REQ-PWRESET-03 | error-guessing | low | @regression @layout | all | automated | specs/password-reset/quality.spec.ts | |
| TC-PWRESET-20 | the forgot page (initial, invalid, sent) and the reset page (initial, invalid, refused, missing token) have no axe violation beyond the baseline | REQ-PWRESET-02 | use-case | medium | @regression @a11y | all | automated | specs/password-reset/quality.spec.ts | |
| TC-PWRESET-21 | the reset page has a level-1 heading, "Choose a new password" or "Invalid reset link", and a title that names the page | REQ-PWRESET-11 | error-guessing | medium | @regression @a11y @known-gap | all | automated | specs/password-reset/reset.spec.ts | LOCAL-68 |
| TC-PWRESET-22 | the field messages and the token message are announced (an `alert` or `status` role, or a live region), and each field message is tied to its field through `aria-describedby` | REQ-PWRESET-06 | error-guessing | high | @regression @a11y @known-gap | all | automated | specs/password-reset/quality.spec.ts | LOCAL-45 |
| TC-PWRESET-23 | Email declares its purpose (`autocomplete` `email` or `username`) and the two password fields declare `new-password` | REQ-PWRESET-12 | error-guessing | medium | @regression @a11y @known-gap | all | automated | specs/password-reset/quality.spec.ts | LOCAL-46 |
| TC-PWRESET-24 | a link whose token is not valid says so when it opens, without the form, and offers a way to ask for a new one | REQ-PWRESET-10 | error-guessing | low | @regression @known-gap | all | automated | specs/password-reset/reset.spec.ts | LOCAL-69 |

## Notes

- **Accounts and mail.** Every case that asks for a member's reset or changes a password (03 to
  07, 09, 10, 14, 17) uses a `staff` account of its own (`actor('staff', { fresh: true })`),
  removed at the end, so the shared admin's password is never touched and no case reads another's
  mail. The invitation reached its address first, so the cases pick the reset email by subject. The
  states that need no account are reached without one, as the contract's states table allows: the
  sent state with <UNKNOWN_EMAIL> (04, 15, 18 to 20), the reset form and its refusal with
  <MADE_UP_TOKEN> (08, 11, 13, 16, 18 to 24). 01, 02 and 12 send nothing. (Corrected on
  2026-11-25 at the automate review, which found the first version listed 08, 16, 18, 19 and 22
  among the cases with an account.)
- **The link and LOCAL-67.** Only TC-PWRESET-05 opens <RESET_LINK> exactly as the email gives it,
  and it runs armed with LOCAL-67. Every other case that follows the link opens its token on
  `/dashboard/reset-password`, a workaround the page object names, until LOCAL-67 is fixed; once it
  is, TC-PWRESET-05 passes unexpectedly and the workaround goes.
- **Contexts.** A signed-in member who opens a reset link is sent to the dashboard (contract,
  navigation), so the cases ask for the reset and open the link in a context without a session.
  TC-PWRESET-14 keeps the staff member's own signed-in context open across the reset to check it
  afterwards.
- **Partitions and boundaries.** Email: empty (02), a staff member's (03), unknown (04); a malformed
  address is the browser's own check, covered for the same field type by TC-LOGIN-03. New password:
  empty and 7 characters refused, 8 accepted (07); two different values (08). Token: valid (06),
  used (09), superseded (10), made up (11, 24), missing (12).
- **Not designed.** The 15-minute life of a link and the per-IP limit, out of scope in the contract.
  No visual case: the layout dimension is covered by the page health guard (19); visual baselines
  for these pages can follow with the login's in the visual lane.
- **Known gaps.** 05, 21, 22, 23 and 24 run red, armed with their keys. 22 and 23 share their keys
  with TC-LOGIN-19 and TC-LOGIN-20, as one fix in the dashboard's form components would close both.
