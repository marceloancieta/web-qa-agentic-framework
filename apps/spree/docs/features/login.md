# Admin sign-in contract

| | |
|---|---|
| Pack and version | `spree` `6.0.3` |
| Feature code | `LOGIN` (case ids `TC-LOGIN-NN`) |
| Routes | `/dashboard/login`<br>`/dashboard/forgot-password`<br>`/dashboard` |
| Sources | no story or issue: intake from the application itself (FUT-01). The app maps (`docs/app-map.json`, `docs/app-map.admin.json`, 2026-11-10); read-only looks at the live application (2026-11-10, desktop Chromium 1280 px, Pixel 7 412 px, desktop WebKit); throwaway probe specs that created and removed their own staff accounts (2026-11-10, desktop Chromium); Spree's API and configuration read in the container |
| Intake date | 2026-11-10 |

## Purpose

As a member of the store's staff, I sign in to the admin dashboard with my email and password so
that I can work on the store, and I sign out when I am done.

## Business rules

| ID | Rule | Source |
|---|---|---|
| REQ-LOGIN-01 | A staff member with the right email and password signs in on `/dashboard/login` and lands on the store's dashboard, `/dashboard/<store id>`, whose heading is "Dashboard". | app map as `admin` (the dashboard after sign-in); the probe's sign-ins through the admin API, 2026-11-10 (A1) |
| REQ-LOGIN-02 | Sign in with both fields empty shows "Invalid email address" under Email and "Password is required" under Password, marks both fields invalid and sends no request. | probe, 2026-11-10 |
| REQ-LOGIN-03 | An email without the shape of an address shows "Invalid email address" and sends no request. | probe, 2026-11-10 |
| REQ-LOGIN-04 | An unknown email and a wrong password get the same message, "Invalid email or password", and the page stays on `/dashboard/login`. | probe, 2026-11-10 |
| REQ-LOGIN-05 | While the sign-in request runs, the button reads "Signing in…" and is disabled. | probe, 2026-11-10 |
| REQ-LOGIN-06 | After five wrong passwords for one account, the account is locked for 30 minutes: even the right password gets "Account temporarily locked. Try again later." | probe, 2026-11-10; Spree configuration (`max_failed_login_attempts` 5, `lockout_duration` 1800 s) |
| REQ-LOGIN-07 | The password is masked while typed (`type=password`). | app map field type; live look |
| REQ-LOGIN-08 | A dashboard route opened without a session leads to `/dashboard/login`. | live look, `/dashboard/<store id>/orders`, desktop and Pixel 7, 2026-11-10 |
| REQ-LOGIN-09 | "Log out" in the user menu ends the session: the page moves to `/dashboard/login`, and a dashboard route opened afterwards leads to the login again. | probe (the menu item and the move to the login), 2026-11-10; the route afterwards is unobserved (A2) |
| REQ-LOGIN-10 | The form works with the keyboard alone: Email has the focus when the page opens, and Tab reaches Password, "Sign in" and "Forgot password?" in that order, each with a visible focus. | live look, desktop Chromium and Pixel 7, 2026-11-10 |
| REQ-LOGIN-11 | Neither the email nor the password reaches the URL, after a refused or a successful sign-in. | probe (the URL stayed `/dashboard/login`; the form signs in with a request, not a navigation), 2026-11-10 |
| REQ-LOGIN-12 | A signed-in staff member who reloads the dashboard stays signed in. | live look, two loads of `/dashboard` in one context, 2026-11-10 |
| REQ-LOGIN-13 | The login page has no horizontal scroll on any device project. | live look, 1280 px and 412 px, 2026-11-10 |

## Acceptance criteria

- **Given** the login page, **when** a staff member signs in with the right email and password,
  **then** the store's dashboard opens with the heading "Dashboard" (REQ-LOGIN-01).
- **Given** the login page, **when** someone signs in with an unknown email or a wrong password,
  **then** the page says "Invalid email or password", stays on the login and the URL carries neither
  value (REQ-LOGIN-04, REQ-LOGIN-11).
- **Given** an account with five wrong passwords in a row, **when** its right password is entered,
  **then** the page says "Account temporarily locked. Try again later." (REQ-LOGIN-06).
- **Given** a visitor without a session, **when** they open a dashboard route, **then** they are on
  `/dashboard/login` (REQ-LOGIN-08).
- **Given** a signed-in staff member, **when** they choose "Log out" in the user menu, **then** the
  login page opens and the dashboard asks for a sign-in again (REQ-LOGIN-09).

## Roles and entry state

- `anonymous`: a fresh context, no cookie.
- `admin`: the existing account qa-config names (`SPREE_ADMIN_EMAIL`, `SPREE_ADMIN_PASSWORD`), made
  by `npm run spree:up`. Cases start signed in through the admin API (`fixtures.ts`): the sign-in sets
  the refresh cookie the dashboard opens with. That cookie works for one context, so the core signs
  in again for each one (`singleUseSessions`, `docs/app-notes.md`).
- A staff account of the case's own for every case that types a password, fails a sign-in or signs
  out: the shared admin must never be locked out or signed out by a case. The admin creates a role
  and invites the account through the API (`POST /api/v3/admin/roles`, `POST
  /api/v3/admin/invitations`, its acceptance link, `POST /api/v3/admin/auth/invitations/<id>/accept`
  with a generated password), and removes both afterwards. Automate builds this as a provisioned
  actor (A3).

## Elements

| Element | Notes |
|---|---|
| `heading "Welcome back"` (level 1) | with the paragraph "Sign in to your admin account" |
| `textbox "Email"` | `type=email`, placeholder `admin@example.com`; focused when the page opens |
| `textbox "Password"` | `type=password` |
| `button "Sign in"` | reads "Signing in…" and is disabled while the request runs |
| `link "Forgot password?"` | to `/dashboard/forgot-password` |
| the message paragraph | above Email after a refused sign-in: "Invalid email or password", "Account temporarily locked. Try again later."; a paragraph with no `alert` or `status` role (G1) |
| the field messages | paragraphs under each field: "Invalid email address", "Password is required" |
| `button "User menu"` → `menuitem "Log out"` | on every dashboard page; the menu also holds the theme, the language and "Edit Profile" |
| `/dashboard/forgot-password` | `heading "Reset your password"`, `textbox "Email"`, `button "Send reset link"`, `link "Back to sign in"` |

## Validations

| Field | HTML constraints (app map) | Beyond them |
|---|---|---|
| Email | `type=email`; no `required`, `autocomplete` or length limit | checked in the page when "Sign in" is pressed: empty or malformed gives "Invalid email address" and `aria-invalid` |
| Password | `type=password`; no `required`, `autocomplete` or length limit | empty gives "Password is required" and `aria-invalid` |

"Sign in" is enabled until it is pressed; the page checks both fields before it sends anything. The
server answers `401` to an unknown email, a wrong password and a locked account alike; the message
differs only for a locked account.

## States

| State | What the page shows | How a case reaches it |
|---|---|---|
| initial | both fields empty, Email focused, "Sign in" enabled | open `/dashboard/login` |
| invalid | the field messages under the fields, both marked invalid | "Sign in" with an empty or malformed field |
| waiting | "Signing in…", disabled | any sign-in with valid fields, until the answer |
| refused | "Invalid email or password" above the fields | a wrong pair, with a staff account of the case's own |
| locked | "Account temporarily locked. Try again later." | five wrong passwords, then any, with an account of the case's own |
| signed in | `/dashboard/<store id>`, heading "Dashboard" | the right pair through the form, or the actor |
| signed out | `/dashboard/login` | "Log out" in the user menu |

## Navigation

The login is reached at `/dashboard/login`, from `/` and `/dashboard` without a session, from any
dashboard route without a session, and after "Log out". A sign-in moves to `/dashboard/<store id>`;
the store id is the same on every install of the sample data (`docs/app-notes.md`), but cases take it
from the page they land on. The dashboard keeps no session in the URL or in local storage: the
refresh cookie is `httpOnly`, scoped to `/api/v3/admin/auth`, and the access token lives in memory.

## Responsive differences

`app.json` declares no breakpoints yet. At 1280 px and 412 px the login has the same elements in the
same order and the same accessibility tree, and neither width scrolls sideways. In WebKit, Tab skips
"Forgot password?", as Safari does with links; the keyboard case leaves that link out on WebKit or
runs as `not-webkit`.

## Network dependencies

| Call | When | A case needs |
|---|---|---|
| `GET /api/v3/admin/auth/setup`, `GET /api/v3/admin/auth/providers` | the login page loads | real answers; a mock only for a store that needs setup, which is out of scope |
| `POST /api/v3/admin/auth/refresh` | every dashboard page load, and the login page | real; `401` without a session |
| `POST /api/v3/admin/auth/login` | "Sign in" | real; `401` for a refused or locked sign-in |
| `POST /api/v3/admin/auth/logout` | "Log out" | real |

## Quality dimensions

| Dimension | Applies? | Expected, or why not |
|---|---|---|
| responsive | applies | no horizontal scroll at any project; the same form at every width |
| perf | applies | the waiting state of "Sign in" appears and goes away |
| security | applies | password masked; the same message for an unknown email and a wrong password; the lockout; protected routes; logout; nothing typed reaches the URL |
| layout | applies | the page health guard on every case |
| navigation | applies | the redirect from a protected route; logout; reload keeps the session |
| a11y | applies | axe against the baseline; keyboard order and visible focus; field errors marked `aria-invalid` |
| content | n/a: the page shows no text the user typed back to them, and its messages never repeat the email |

## Measurements

| What | Route | Device | Date |
|---|---|---|---|
| Accessibility tree: heading, Email, Password, "Sign in", "Forgot password?", the Notifications region | `/dashboard/login` | desktop Chromium, Pixel 7 | 2026-11-10 |
| Tab from the page: Email focused on load; Password, "Sign in", "Forgot password?", then the page; focus shown by a box shadow on the fields and the button, an outline on the link | `/dashboard/login` | desktop Chromium, Pixel 7 | 2026-11-10 |
| Tab in WebKit: Password, "Sign in", the page, Email; the link is skipped | `/dashboard/login` | desktop WebKit | 2026-11-10 |
| `scrollWidth` equal to the viewport: 1280 and 412 | `/dashboard/login` | desktop Chromium, Pixel 7 | 2026-11-10 |
| `/dashboard/<store id>/orders` without a session: on `/dashboard/login` | `/dashboard/<store id>/orders` | desktop Chromium, Pixel 7 | 2026-11-10 |
| Empty sign-in: both field messages, 2 fields `aria-invalid`, no request; unknown email and wrong password: "Invalid email or password" after a `401`; after five: the lockout message | `/dashboard/login` | desktop Chromium (probe account) | 2026-11-10 |
| The refresh cookie rotates on every use; a used one gets `401` | `POST /api/v3/admin/auth/refresh` | API | 2026-11-10 |

## Gaps and discrepancies

Each gap was searched in the local tracker on 2026-11-10; the only Spree issue there is `LOCAL-44`
(security headers), which covers none of them.

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | The refusal and lockout messages are plain paragraphs with no `alert` or `status` role; a screen reader may not announce them (WCAG 2.1 SC 4.1.3). Whether the field messages are tied to their fields (`aria-describedby`) is not known yet. | probe accessibility tree, 2026-11-10 | searched, none |
| G2 | Email and Password have no `autocomplete` value (WCAG 2.1 SC 1.3.5 for the email) and no `required`. | app map and live look, 2026-11-10 | searched, none |
| G3 | Whether five wrong passwords for an unknown email also end with the lockout message; if they do not, the message tells an attacker that the account exists. | not observed | searched, none |
| G4 | Back after "Log out" left the probe's page on `about:blank`, because the dashboard was its first page; what Back shows after a longer history is not known. | probe, 2026-11-10 | searched, none |

## Out of scope

- The password reset: "Send reset link" sends an email, and reading it needs the mail catcher of
  FUT-07, which adds it.
- Signing in through other providers: `auth/providers` lists only email and password.
- The first-run setup of a new store (`auth/setup` answers `setup_required: false` once
  `spree:up` has made the admin).
- The theme, the language and "Edit Profile" in the user menu: the language belongs to FUT-04.
- The rate limits of sign-ins: the local Spree raises them (`docker/compose.yml`) so parallel runs
  pass, and testing a limit would stop every other worker's sign-ins.

## Assumptions to confirm

- A1: REQ-LOGIN-01 through the form. The probes signed in through the API, which is what the form
  calls; automate watches the form do it with an account of its own.
- A2: REQ-LOGIN-09 after the move to the login: a dashboard route opened afterwards should lead to
  the login, since logout revokes the refresh cookie. Automate watches it.
- A3: the cases that type a password use a provisioned staff actor that the pack's provider creates
  and removes through the admin API. The `admin` actor stays the only existing account.
- A4: `SPREE_ADMIN_EMAIL` holds a placeholder address (`admin@example.test`): the dashboard shows
  the admin's email in the user menu, so a real one would reach screenshots and traces.
