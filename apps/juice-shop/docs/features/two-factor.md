# Two-factor authentication contract

| | |
|---|---|
| Pack and version | `juice-shop` `20.3.0` |
| Feature code | `TWOFACTOR` (case ids `TC-TWOFACTOR-NN`) |
| Routes | `/#/privacy-security/two-factor-authentication`, `/#/2fa/enter` |
| Related | the login form that leads to the code: [sign-in](login.md) |
| Sources | no story or issue: intake from the application itself (FUT-07). The app maps (`docs/app-map.json`, `docs/app-map.customer.json`, 2026-11-24); the application's own texts (`/assets/i18n/en.json`); a throwaway spec that set up, used and removed two-factor authentication on accounts it created (2026-11-24, desktop Chromium 1280 px and mobile Chrome 412 px), deleted after the intake |
| Intake date | 2026-11-24 |

## Purpose

As a customer, I add a time-based one-time code (TOTP, RFC 6238) from an authenticator app to my
account, so that my password alone no longer signs me in; and I can remove it again with my
password.

## Business rules

| ID | Rule | Source |
|---|---|---|
| REQ-TWOFACTOR-01 | With two-factor authentication off, the setup page shows the instructions, a QR code, the Current Password and Initial Token fields, and Save, disabled until both fields are valid. | app map, 2026-11-24; probe, 2026-11-24 |
| REQ-TWOFACTOR-02 | Save with the current password and a code from the secret the page received turns it on: the page says "You have enabled 2FA for your account. Thank you for taking the time to keep your juices safe!", confirms "Setup of Two-Factor Authentication successfully completed." and offers the removal instead of the setup. | probe, 2026-11-24 (`/rest/2fa/status` then answered `setup: true`) |
| REQ-TWOFACTOR-03 | Save with a wrong password, or with a wrong code, is refused with "Failed to change 2FA setup. Check if you entered your password (and token) correctly." and two-factor authentication stays off. | probe, 2026-11-24 (both answered `401`) |
| REQ-TWOFACTOR-04 | Once it is on, the right password moves the login to `/#/2fa/enter` ("Enter the 6 digit token from your 2FA app") and gives no session yet. | probe, 2026-11-24 (no `token` in storage or cookies after the password) |
| REQ-TWOFACTOR-05 | The current code signs in: the page moves to `/#/search` with the customer's session. | probe, 2026-11-24 |
| REQ-TWOFACTOR-06 | A wrong code is refused with "The token appears to be invalid.", and the page stays on `/#/2fa/enter` without a session. | probe, 2026-11-24 (`POST /rest/2fa/verify` answered `401`) |
| REQ-TWOFACTOR-07 | The Log in button of `/#/2fa/enter` stays disabled until the field holds six digits; the field takes at most six characters. | app map (`required`, `minlength=6`, `maxlength=6`, `pattern=^[\d]{6}$`); probe: disabled when empty, with five digits and with six letters |
| REQ-TWOFACTOR-08 | A code of the 30-second step before or after the current one is accepted; a code two steps away is refused. | probe, 2026-11-24 (offsets -1 and +1 answered `200`, -2 and +2 `401`) |
| REQ-TWOFACTOR-09 | With two-factor authentication on, the setup page offers "Remove 2FA from your account" with the current password: a wrong password is refused with the failure message, the right one turns it off ("Two-Factor Authentication has been removed."), the setup form comes back, and the password alone signs in again. | probe, 2026-11-24 |
| REQ-TWOFACTOR-10 | `/#/2fa/enter` opened without a pending login refuses any code, the current one included, with the invalid-token message. | probe, 2026-11-24 (`401`) |
| REQ-TWOFACTOR-11 | Both forms can be filled and sent with the keyboard alone, the focus visible on each control in reading order. | quality checklist, WCAG 2.1 SC 2.1.1 and 2.4.7 |
| REQ-TWOFACTOR-12 | Neither page has horizontal scroll on any device project. | quality checklist; probe: no overflow at 412 px and 1280 px |
| REQ-TWOFACTOR-13 | A code that completed a login is refused afterwards, and a pending-login token completes one login at most. The application breaks it (G4). | RFC 6238 section 5.2; added at design, 2026-11-24 |
| REQ-TWOFACTOR-14 | Once the code signs in, the pending-login token is gone from browser storage. The application breaks it (G5). | security checklist (what the page stores); added at design, 2026-11-24 |
| REQ-TWOFACTOR-15 | An empty required field of the setup form, once left, says what is missing. The application breaks it (G7). | the login form's convention (REQ-LOGIN-04); added at design, 2026-11-24 |

## Acceptance criteria

- **Given** a customer with two-factor authentication off, **when** they save the setup with their
  password and the current code, **then** the page says it is enabled and the next login asks for a
  code (REQ-TWOFACTOR-02, REQ-TWOFACTOR-04).
- **Given** a login waiting for its code, **when** the customer enters the current code, **then**
  the page moves to `/#/search` signed in; a wrong code keeps them on `/#/2fa/enter` with "The token
  appears to be invalid." (REQ-TWOFACTOR-05, REQ-TWOFACTOR-06).
- **Given** a customer with two-factor authentication on, **when** they remove it with their
  password, **then** the password alone signs them in again (REQ-TWOFACTOR-09).

## Roles and entry state

- `customer` with an account of the case's own (`actor('customer', { fresh: true })`): setting
  up and removing two-factor authentication change what the account holds, and an account with it
  on can no longer sign in through `AccountApi.login`, which expects one step.
- `anonymous`: a fresh context with the pack's cookies, for the login with a code and for
  `/#/2fa/enter` opened directly.
- The code is generated by the test from the account's secret (RFC 6238: HMAC-SHA1, 30-second
  steps, six digits). The secret is the one the page received from `GET /rest/2fa/status`; every
  call to that endpoint answers a new one (`docs/app-notes.md`).

## Elements

| Element | Route | Notes |
|---|---|---|
| `heading "2FA Configuration"` (level 1) | setup | |
| the instructions text, "Scan the QR code into an authenticator app supporting TOTP (e.g. Google Authenticator) to get started." | setup | shown while it is off |
| QR code | setup | a `canvas` inside `qrcode`, no accessible name or text alternative (G1) |
| `textbox "Field to enter the current password"` | setup | visible label "Current Password"; `type=password`, `autocomplete=off`; used by the setup and by the removal |
| `textbox "Field to enter the initial token. This must have 6 digits."` | setup | visible label "Initial Token", counter `0/6` |
| `button "Button to complete the two-factor configuration"` | setup | visible text "Save" |
| `heading "Remove 2FA from your account"` (level 2) | setup | shown while it is on |
| `button "Button to remove the two-factor authentication"` | setup | visible text "Remove"; disabled until the password has a value |
| snack bar with `button "X"` | setup | holds the confirmations of REQ-TWOFACTOR-02 and REQ-TWOFACTOR-09 |
| `heading "Two Factor Authentication"` (level 1) | enter | |
| `textbox "Field for entering the Two Factor token"` | enter | visible label "2FA Token", counter `0/6`, no `autocomplete` or `inputmode` |
| `button "Button to confirm the input"` | enter | visible text "Log in" |
| the invalid-token message | enter | a plain text block, no role or live region (G3) |

## Validations

| Field | HTML constraints (app map) | Beyond them (probe) |
|---|---|---|
| Current Password | `required`, `type=password`, `autocomplete=off` | no message when left empty (G7) |
| Initial Token | `required`, `minlength=6`, `maxlength=6`, `pattern=^[\d]{6}$` | "The token appears to be invalid." when left empty or holding letters |
| 2FA Token | `required`, `minlength=6`, `maxlength=6`, `pattern=^[\d]{6}$` | Log in disabled until valid (REQ-TWOFACTOR-07) |

The server checks the password and the code only on submit: `POST /rest/2fa/setup`,
`POST /rest/2fa/disable` and `POST /rest/2fa/verify` answer `401` with an empty body when either is
wrong.

## States

| State | Route | What the page shows | How a case reaches it |
|---|---|---|---|
| off | setup | instructions, QR code, setup form, Save disabled | a fresh account |
| setup refused | setup | the failure message under the form; the fields keep their values | a wrong password or a wrong code |
| on | setup | the enabled text, the removal form, the confirmation in a snack bar | a valid setup |
| removal refused | setup | the failure message above Current Password | a wrong password |
| off again | setup | the setup form and "Two-Factor Authentication has been removed." | a valid removal |
| waiting for the code | enter | the code form, Log in disabled; no session; `totp_tmp_token` in local storage | the password of an account with it on |
| code refused | enter | the invalid-token message, the field keeps the code | a wrong code, or no pending login |
| signed in | `/#/search` | the account menu with the email | the current code |

## Navigation

The setup page is reached from the account menu (Privacy & Security, then Two Factor
Authentication) or its address, signed in. `/#/2fa/enter` is reached from the login form of an
account with it on, and opens without one too (REQ-TWOFACTOR-10). After the code the page moves to
`/#/search`. A reload of the setup page keeps the state it shows (on or off).

## Responsive differences

None seen between 412 px and 1280 px: the same forms in the same order, no horizontal scroll. The QR
code is a fixed 300 px canvas, which fits the narrowest device project. The account menu changes at
`breakpoints.toolbar` as on every page (`components/account-menu.ts`).

## Network dependencies

- `GET /rest/2fa/status`: `{ setup: false, secret, email, setupToken }` while it is off, a new
  secret on every call; `{ setup: true }` while it is on.
- `POST /rest/2fa/setup` (`password`, `setupToken`, `initialToken`), `POST /rest/2fa/disable`
  (`password`).
- `POST /rest/user/login` answers `401` with `status: totp_token_required` and a `tmpToken` for an
  account with it on; `POST /rest/2fa/verify` (`tmpToken`, `totpToken`) answers the authentication.

## Quality dimensions

| Dimension | Applies? | Expected, or why not |
|---|---|---|
| responsive | applies | no horizontal scroll on either page at any project; the QR code fits |
| perf | n/a | neither page shows a loading state: the forms render at once, and the only part that waits for an answer is the QR code (empty until `/rest/2fa/status` answers, G2) |
| security | applies | no session after the password alone; a wrong code and a code from two steps away refused; `/#/2fa/enter` without a pending login refuses the current code; nothing secret in the URL; a used code accepted again (G4), the pending-login token left in storage (G5) |
| layout | applies | the page health guard on every case (G2 logs a console error on every load of the setup page); the visual cases of both pages, the QR code masked |
| navigation | applies | Save, Remove and Log in disabled until their fields are valid; the move to `/#/2fa/enter` and on to `/#/search`; a reload of the setup page |
| a11y | applies | axe against the baseline on both pages and states; the keyboard order; the QR code without a text alternative (G1); the invalid-token message not announced (G3) |
| content | n/a | neither page shows back text the user wrote |

## Measurements

| What | Route | Device | Date |
|---|---|---|---|
| Setup with a wrong password, then a wrong code: `401`, the failure message; with both right: `200`, the enabled state | setup | desktop Chromium | 2026-11-24 |
| Login with the password: `401 totp_token_required`, then `/#/2fa/enter` with `totp_tmp_token` in local storage and no `token` | enter | desktop Chromium | 2026-11-24 |
| Codes at offsets -2, -1, +1, +2 steps: `401`, `200`, `200`, `401` | the API | desktop Chromium | 2026-11-24 |
| The same code verified twice on two logins, and the same `tmpToken` twice: `200` each time | the API | desktop Chromium | 2026-11-24 |
| A code on `/#/2fa/enter` opened directly: `401`, the invalid-token message | enter | desktop Chromium, mobile Chrome | 2026-11-24 |
| No horizontal overflow | enter | desktop Chromium, mobile Chrome | 2026-11-24 |

## Gaps and discrepancies

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | The QR code is a canvas with no accessible name, and the secret is never shown as text, so a customer who cannot scan it (a screen reader, an authenticator on the device that shows the page) cannot set up two-factor authentication (WCAG 2.1 SC 1.1.1). | probe, 2026-11-24 | LOCAL-60 (S2) |
| G2 | Every load of the setup page logs `[angularx-qrcode] Error generating QR Code: … Field qrdata is empty`: before `/rest/2fa/status` answers, and on every load while it is on. | probe, 2026-11-24 | LOCAL-61 (S3) |
| G3 | "The token appears to be invalid." on `/#/2fa/enter` is plain text: no alert role or live region, and the field is neither `aria-invalid` nor described by it, so a screen reader is not told the code was refused (WCAG 2.1 SC 3.3.1, 4.1.3). The login form announces its refusal as an alert. | probe, 2026-11-24 | LOCAL-62 (S2) |
| G4 | A code is accepted again after it was used: the same code completed two logins, and the same pending-login token completed a login twice. RFC 6238 section 5.2 says a code must not be accepted a second time once it was validated. | probe, 2026-11-24 | LOCAL-63 (S2) |
| G5 | After the code signs in, `totp_tmp_token` stays in local storage beside the session. | probe, 2026-11-24 | LOCAL-64 (S3) |
| G6 | A failure message stays on screen after a later success: after a refused setup, the successful one shows "Failed to change 2FA setup…" beside the enabled text; the same after a refused removal. | probe, 2026-11-24 | LOCAL-65 (S3) |
| G7 | An empty Initial Token says "The token appears to be invalid." rather than asking for it, and an empty Current Password says nothing. | probe, 2026-11-24 | LOCAL-66 (S4) |

## Out of scope

- The expiry of a pending login (`tmpToken`): it runs on the server's clock, which `page.clock`
  cannot move, and waiting it out would hold a case for minutes.
- Recovery codes and a lost authenticator: the application offers neither.
- Scanning the QR code: the cases take the secret from the page's own `/rest/2fa/status` answer
  and do not decode the canvas (A1).
- "Login with Google" for an account with two-factor authentication on: it hands over to a third
  party, as in the login contract.

## Assumptions to confirm

- A1: the QR code encodes an `otpauth://totp/` address with the same secret as the status answer the
  page received. The canvas is not decoded; a setup with codes from that secret succeeding is what
  shows the secret is the account's.
- A2: the failure message of the setup page is as silent for a screen reader as the invalid-token
  message of G3; the probe did not read its element.
