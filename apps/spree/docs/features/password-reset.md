# Admin password reset contract

| | |
|---|---|
| Pack and version | `spree` `6.0.3` |
| Feature code | `PWRESET` (case ids `TC-PWRESET-NN`) |
| Routes | `/dashboard/forgot-password`<br>`/dashboard/reset-password` |
| Sources | no story or issue: intake from the application itself (FUT-07). The app map (`docs/app-map.json`, 2026-11-25); throwaway probe specs that created and removed their own staff accounts and read their mail from the mail catcher (2026-11-25, desktop Chromium and Pixel 7); Spree's API controller, mailer and configuration, and the dashboard's script, read in the container |
| Intake date | 2026-11-25 |

## Purpose

As a member of the store's staff who forgot my password, I ask the dashboard for a reset link, open
it from the email and choose a new password, so that I can sign in again without an administrator.

## Business rules

| ID | Rule | Source |
|---|---|---|
| REQ-PWRESET-01 | `/dashboard/forgot-password` shows the heading "Reset your password", Email with the focus, "Send reset link" and "Back to sign in", which leads to `/dashboard/login`. | app map; probe, 2026-11-25 |
| REQ-PWRESET-02 | "Send reset link" with Email empty shows "Invalid email address" under it, marks it invalid and sends no request. | probe, 2026-11-25 |
| REQ-PWRESET-03 | For a staff member's email, the form gives way to "Check your email" and "If an account exists for that email, a password reset link is on its way.", and one email titled "`<store name>` Password Reset Instructions" reaches that address with a "Reset Password" link. | probe and the mail catcher, 2026-11-25 (the mail arrived within 2 s) |
| REQ-PWRESET-04 | For an email with no account the page shows the same confirmation, and no email is sent to it: the page does not tell which emails have an account. | probe and the mail catcher, 2026-11-25; the API answers `202` with the same message to both |
| REQ-PWRESET-05 | The link in the email opens the dashboard's "Choose a new password" page with the link's token. | the mailer and the API's `redirect_url` rule; the application breaks it (G1) |
| REQ-PWRESET-06 | On the reset page, "New password" has the focus; "Reset password" with a new password shorter than 8 characters, empty included, shows "Password must be at least 8 characters", marks it invalid and sends no request. | probe, 2026-11-25 (empty, 7 characters) |
| REQ-PWRESET-07 | "Reset password" with two different passwords shows "Passwords do not match" under "Confirm new password", marks it invalid and sends no request. | probe, 2026-11-25 |
| REQ-PWRESET-08 | A valid link and a new password of 8 characters or more, typed twice, change the password and sign the member in: the page moves to the store's dashboard, heading "Dashboard". Afterwards the new password signs in and the old one is refused. | probe, 2026-11-25 (`PATCH` answered `200`; sign-ins through the admin API) |
| REQ-PWRESET-09 | A link works until the password changes: the link just used, and any other link sent before the change, still show the form, but "Reset password" says "Password reset token is invalid or has expired." and stays on the page. | probe, 2026-11-25 (two links for one account; `PATCH` answered `422`); Spree derives the token from the password (`generates_token_for :password_reset`) |
| REQ-PWRESET-10 | A link whose token is not one Spree issued gets the same message when "Reset password" is pressed. | probe, 2026-11-25 |
| REQ-PWRESET-11 | `/dashboard/reset-password` without a token shows "Invalid reset link", "This password reset link is missing its token." and "Request a new reset link", which leads to `/dashboard/forgot-password`. | app map; probe, 2026-11-25 |
| REQ-PWRESET-12 | Both password fields mask what is typed (`type=password`). | probe, 2026-11-25 |
| REQ-PWRESET-13 | A reset ends every session the member had before it: a session opened before the reset can no longer renew itself. | Spree's controller (`RefreshToken.revoke_all_for` before the new session); unobserved (A1) |
| REQ-PWRESET-14 | Both pages work with the keyboard alone: on the forgot page Tab goes from Email to "Send reset link" and "Back to sign in"; on the reset page from "New password" to "Confirm new password" and "Reset password"; each shows its focus. | probe, desktop Chromium and Pixel 7, 2026-11-25 |
| REQ-PWRESET-15 | The typed email never reaches the URL, and once the password is changed the address bar no longer holds the token. | probe, 2026-11-25 (the request is a `POST` with a JSON body; after the reset the page is `/dashboard/<store id>`) |
| REQ-PWRESET-16 | Neither page scrolls sideways on any device project. | probe, 1280 px and 412 px, 2026-11-25 |

## Acceptance criteria

- **Given** a staff member on the forgot page, **when** they send their email, **then** the page says
  "Check your email" and one "Password Reset Instructions" email reaches their address
  (REQ-PWRESET-03).
- **Given** an email with no account, **when** it is sent, **then** the page says the same and no
  email goes to it (REQ-PWRESET-04).
- **Given** the link of that email, **when** the member opens it and types a new password twice,
  **then** they are signed in on the store's dashboard, and only the new password signs in
  (REQ-PWRESET-05, REQ-PWRESET-08).
- **Given** a link already used, **when** it is opened and a new password sent, **then** the page
  says "Password reset token is invalid or has expired." (REQ-PWRESET-09).

## Roles and entry state

- `anonymous`: every case starts on the forgot or the reset page with a fresh context and no
  session; a member who forgot the password has none.
- A staff account of the case's own for every case that asks for a reset or changes a password: a
  provisioned actor made with `actor(role, { fresh: true })` (the admin creates a role, invites the
  address and accepts the invitation through the API). The shared admin's password is never reset.
  Its address is on `example.test`, so the mail catcher lets the case read its mail.
- The mail comes from the mail catcher the pack's entry in qa-config names (`mail_catcher`, Mailpit in
  the local and ci environments); the `mail` fixture reads only the addresses a case created
  (ADR 0014).

## Elements

| Element | Notes |
|---|---|
| `heading "Reset your password"` (level 1) | forgot page, with the paragraph "Enter your email and we'll send you a link to reset your password." |
| `textbox "Email"` | `type=email`, placeholder `admin@example.com`; focused when the page opens |
| `button "Send reset link"` | forgot page |
| `link "Back to sign in"` | to `/dashboard/login`; on the form and on the confirmation |
| the confirmation | text "Check your email" and "If an account exists for that email, a password reset link is on its way."; no heading, no `status` role |
| "Choose a new password" | the reset page's title, plain text: the page has no heading (G2) |
| `textbox "New password"`, `textbox "Confirm new password"` | `type=password`, names `password` and `password_confirmation`; no `autocomplete` (G4) |
| `button "Reset password"` | reset page |
| the token message | a paragraph above "New password": "Password reset token is invalid or has expired." |
| "Invalid reset link" | without a token: text, "This password reset link is missing its token.", `link "Request a new reset link"` |
| the field messages | paragraphs under the fields: "Invalid email address", "Password must be at least 8 characters", "Passwords do not match"; no `alert` role and no `aria-describedby` (G3) |
| the email | subject "`<store name>` Password Reset Instructions", from the store's address (`no-reply@example.com` in the sample data), a "Reset Password" button and the same link in the text, and a link to the store's URL |

## Validations

| Field | HTML constraints | Beyond them |
|---|---|---|
| Email | `type=email`; no `required`, `autocomplete` or length limit | empty gives "Invalid email address" and `aria-invalid`; a malformed address is stopped by the browser's own check first, as on the login (`REQ-LOGIN-03`) |
| New password | `type=password`; no `required`, `minlength` or `autocomplete` | fewer than 8 characters, empty included: "Password must be at least 8 characters" and `aria-invalid` |
| Confirm new password | `type=password`; the same | different from New password: "Passwords do not match" and `aria-invalid` |

The page checks the fields before it sends anything; the server checks the token only when
"Reset password" is pressed. The boundary is 8 characters: 7 is refused by the page, 8 passes it.

## States

| State | What the page shows | How a case reaches it |
|---|---|---|
| forgot, initial | the form, Email focused | open `/dashboard/forgot-password` |
| forgot, invalid | "Invalid email address", Email invalid | "Send reset link" with Email empty |
| sent | "Check your email" and the sentence, "Back to sign in" | any well-formed email |
| reset, initial | the two fields, "New password" focused | open a link with a token, valid or not |
| reset, invalid | the field messages | a short or mismatched pair |
| reset, refused | "Password reset token is invalid or has expired." above the fields | a used, superseded or made-up token |
| reset, missing token | "Invalid reset link" and "Request a new reset link" | open `/dashboard/reset-password` without a query |
| reset, done | the store's dashboard, signed in | a valid link and a valid pair |

## Navigation

The forgot page is reached from "Forgot password?" on the login (`REQ-LOGIN-10`) and from "Request a
new reset link". The reset page is reached from the email only, and leads to the store's dashboard
after a reset. A member who is already signed in and opens a reset link is sent to the dashboard
instead (probe, 2026-11-25), so every case opens the links in a context without a session.

## Responsive differences

`app.json` declares no breakpoints. At 1280 px and 412 px both pages have the same elements in the
same order and the same Tab order, and neither scrolls sideways.

## Network dependencies

| Call | When | A case needs |
|---|---|---|
| `POST /api/v3/admin/auth/password_resets` | "Send reset link" | real: `202` for any email, with `redirect_url` (G1) |
| the mail job | after that answer, inside Spree's web process | the mail catcher; the case waits for the message |
| `PATCH /api/v3/admin/auth/password_resets/<token>` | "Reset password" | real: `200` with a session, `422` for a bad token |
| `POST /api/v3/admin/auth/refresh` | every page load | real; `401` without a session |

Local Spree raises the per-IP limit of reset requests (`SPREE_RATE_LIMIT_PASSWORD_RESET`, 3 a minute
by default) in `docker/compose.yml`, so parallel runs pass.

## Quality dimensions

| Dimension | Applies? | Expected, or why not |
|---|---|---|
| responsive | applies | no horizontal scroll on either page at any project |
| perf | n/a: "Send reset link" and "Reset password" answer at once on the local Spree and the probe saw no waiting state; the mail's delay is the mail job's, not something the page shows |
| security | applies | no account enumeration; links that stop working once used or superseded; a made-up token refused; earlier sessions ended; passwords masked; nothing typed in the URL and the token gone after the reset |
| layout | applies | the page health guard on every case |
| navigation | applies | "Back to sign in", "Request a new reset link", the link from the email, the move to the dashboard |
| a11y | applies | axe against the baseline on both pages; keyboard order and visible focus; fields marked `aria-invalid` |
| content | n/a: neither page shows text the user typed back to them; the confirmation never repeats the email |

## Measurements

| What | Route | Device | Date |
|---|---|---|---|
| Accessibility tree of the form, the confirmation, the reset form and the missing-token state | both | desktop Chromium, Pixel 7 | 2026-11-25 |
| Email focused on load; Tab: "Send reset link" (box shadow), "Back to sign in" (outline), the page | `/dashboard/forgot-password` | desktop Chromium, Pixel 7 | 2026-11-25 |
| "New password" focused on load; Tab: "Confirm new password", "Reset password" (box shadow), the page | `/dashboard/reset-password?token=…` | desktop Chromium, Pixel 7 | 2026-11-25 |
| `scrollWidth` equal to the viewport: 1280 and 412 | both | desktop Chromium, Pixel 7 | 2026-11-25 |
| The email arrived 1.6 s after "Send reset link"; none for the unknown address | the mail catcher | desktop Chromium | 2026-11-25 |
| The link of the email: `<base_url>/reset-password?token=…`, which answers `404`; `<base_url>/dashboard/reset-password?token=…` answers `200` | both | HTTP | 2026-11-25 |
| `Referrer-Policy: strict-origin-when-cross-origin` on both pages, so the token never leaves the origin in a referrer | both | desktop Chromium | 2026-11-25 |

## Gaps and discrepancies

Each gap was searched in the local tracker on 2026-11-25 ("reset password", "reset-password",
"forgot", "redirect_url", "heading", "autocomplete"); none was there. G1, G2 and G5 were filed and
G3 and G4 added to the login's issues on 2026-11-25, after the intake review.

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | The link in the email leads to `<base_url>/reset-password`, which answers `404`, so no member can reset a password from the email. The dashboard sends `redirect_url` as its origin followed by `/reset-password`, without the `/dashboard` path it is served under, and the API accepts it because only the origin is compared. Opened under `/dashboard`, the same token works. | probe and the dashboard's script, 2026-11-25 | LOCAL-67 (S2) |
| G2 | The reset page has no heading ("Choose a new password" is plain text) and its title is "Spree Admin", where the forgot page has a level-1 heading and its own title (WCAG 2.1 SC 2.4.2, 2.4.6). | app map and probe, 2026-11-25 | LOCAL-68 (S3) |
| G3 | The field and token messages on both pages are plain paragraphs outside the live regions, and the fields get `aria-invalid` without `aria-describedby`: a screen reader announces none of them. The login has the same gap. | probe, 2026-11-25 | LOCAL-45, commented for these pages on 2026-11-25 |
| G4 | Email has no `autocomplete` and no `required`; the password fields have no `autocomplete="new-password"`, so a password manager does not offer to make or save the new password. The login has the same gap for its fields. | probe, 2026-11-25 | LOCAL-46, commented for these pages on 2026-11-25 |
| G5 | A used, superseded or made-up token shows the form like a valid one; the member learns the link is dead only after typing a new password twice. | probe, 2026-11-25 | LOCAL-69 (S4) |

## Out of scope

- The 15-minute life of a link (`admin_password_reset_expires_in`): the server's clock cannot be
  moved from a case, and waiting 15 minutes per run is not worth it.
- The per-IP limit of reset requests: the local Spree raises it, and testing it would stop every
  other worker's requests.
- The `redirect_url` rule of the API (honoured only for the dashboard's origin and a staff member of
  the store): it is the API's behaviour, not the page's, and the page always sends its own origin.
- The content and layout of the email beyond its subject and links.
- Storefront customers' password reset: the storefront is not part of this pack.

## Assumptions to confirm

- A1: a session opened before a reset stops renewing itself after it (REQ-PWRESET-13); read in the
  controller, not observed.
- A2: G1 holds on every Spree install that serves the dashboard under `/dashboard`, the image's
  layout; an install that serves it at the root of its own host would get a working link.
