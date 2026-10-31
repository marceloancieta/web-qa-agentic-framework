# Sign-in contract

| | |
|---|---|
| Pack and version | `saucedemo` `live` |
| Feature code | `LOGIN` (case ids `TC-LOGIN-NN`) |
| Routes | `/` |
| Sources | no story or issue: intake from the application itself (SD-01). The app map (`docs/app-map.json`, `docs/app-map.standard.json`, 2026-10-31); a read-only look at the live application (2026-10-31, desktop Chromium 1280 px and Pixel 7 412 px wide); the application's script read as text (`/assets/index-*.js`, 2026-10-31); the sign-in smoke (`specs/smoke/sign-in.spec.ts`, 2026-10-31) |
| Intake date | 2026-10-31 |

## Purpose

As a shopper, I enter my user name and password on the login page so that I am signed in and can
browse the products.

## Business rules

| ID | Rule | Source |
|---|---|---|
| REQ-LOGIN-01 | An accepted user signs in with the password shown on the page and lands on `/inventory.html`, which shows the product list. | the application's script (the login handler moves to the inventory); the sign-in smoke reaches the list with the session cookie |
| REQ-LOGIN-02 | Login with an empty user name shows "Epic sadface: Username is required" as an alert, marks both fields as in error and stays on `/`. | live look, 2026-10-31 |
| REQ-LOGIN-03 | Login with a user name and an empty password shows "Epic sadface: Password is required" and stays on `/`. | the application's script |
| REQ-LOGIN-04 | An unknown user name and a wrong password get the same message, "Epic sadface: Username and password do not match any user in this service", and the page stays on `/`. | the application's script |
| REQ-LOGIN-05 | `locked_out_user` with the right password is refused with "Epic sadface: Sorry, this user has been locked out.", stays on `/` and cannot open a protected page. | the application's script |
| REQ-LOGIN-06 | "Dismiss error" removes the message and the error marks on the fields. | live look (the alert and its button), 2026-10-31; the application's script |
| REQ-LOGIN-07 | The password is masked while typed (`type=password`). | app map field type; live look |
| REQ-LOGIN-08 | A protected page opened without a session sends the visitor to `/`, which says "Epic sadface: You can only access '<path>' when you are logged in." | live look, `/inventory.html`, 2026-10-31 |
| REQ-LOGIN-09 | The form can be filled and sent with the keyboard alone: Tab reaches Username, Password and Login in that order. | live look, 2026-10-31; WCAG 2.1 SC 2.1.1 |
| REQ-LOGIN-10 | Logout in the menu ends the session: the page returns to `/`, and Back or a protected page opened afterwards leads to `/` again. | the application's script (Logout removes the session cookie) |
| REQ-LOGIN-11 | Neither the user name nor the password reaches the URL, after a refused or a successful login. | the application's script (the form never submits to a URL); quality checklist |
| REQ-LOGIN-12 | The page has no horizontal scroll on any device project. | live look, 1280 px and 412 px, 2026-10-31 |

## Acceptance criteria

- **Given** the login page, **when** `standard_user` signs in with the password the page shows,
  **then** the page moves to `/inventory.html` and the product list is visible (REQ-LOGIN-01).
- **Given** the login page, **when** someone signs in with an unknown user name or with a wrong
  password, **then** the same alert says "Epic sadface: Username and password do not match any user
  in this service" and the URL stays `/` (REQ-LOGIN-04, REQ-LOGIN-11).
- **Given** the login page, **when** `locked_out_user` signs in with the right password, **then** the
  alert says the user has been locked out and `/inventory.html` sends back to `/` (REQ-LOGIN-05).
- **Given** a visitor without a session, **when** they open `/inventory.html`, **then** they are on
  `/` with the message naming the path (REQ-LOGIN-08).

## Roles and entry state

- `anonymous`: a fresh context, no cookie.
- `standard`: the existing account named by qa-config (`SAUCEDEMO_STANDARD_USER`,
  `SAUCEDEMO_PASSWORD`). Only the login cases type its password; every other case starts signed in
  through the `session-username` cookie the `standard` fixture builds (`fixtures.ts`).
- `locked_out_user`: one of the accepted user names the page lists. It has no actor yet; the
  lockout case needs its user name from the environment like the standard one (A2).

## Elements

| Element | Notes |
|---|---|
| `form "Login"` | |
| `textbox "Username"` | the name comes from the placeholder; no visible label |
| `textbox "Password"` | the name comes from the placeholder; no visible label |
| `button "Login"` | an `input type=submit` |
| `alert` | holds "Epic sadface: …" and `button "Dismiss error"` after a refused login |
| `heading "Accepted usernames are:"`, `heading "Password for all users:"` (level 4) | the demo's credentials hint, below the form |
| `button "Open Menu"` → Logout | on every signed-in page; Logout is an `a role=button` |

## Validations

| Field | HTML constraints (app map) | Beyond them |
|---|---|---|
| Username | `type=text`; no `required`, `maxlength` or `autocomplete` | empty on Login: "Username is required" (live look) |
| Password | `type=password`; no `required`, `maxlength` or `autocomplete` | empty with a user name on Login: "Password is required" (script) |

The page checks the pair only on Login, in the browser: the user names it accepts and the password
are built into its script, and nothing is sent to a server (`docs/app-notes.md`). Login is never
disabled.

## States

| State | What the page shows | How a case reaches it |
|---|---|---|
| initial | both fields empty, Login enabled, the credentials hint below | open `/` |
| refused | the alert with its message, both fields marked as in error, the URL unchanged | Login with an empty field, a wrong pair or `locked_out_user` |
| dismissed | the alert gone, the fields unmarked | "Dismiss error" |
| signed in | `/inventory.html` with the product list | `standard_user` through the form |
| redirected | `/` with the message naming the protected path | a protected page without a session |
| waiting | none: the check runs in the page and moves on at once | — |

## Navigation

Reached at `/`, from Logout in the menu, and from any protected page opened without a session. After
a login it moves to `/inventory.html`. A signed-in user who opens `/` sees the form again, with no
redirect (G6). Logout removes the session cookie and moves to `/` (REQ-LOGIN-10).

## Responsive differences

`app.json` declares no breakpoints. At 1280 px and 412 px the form has the same fields in the same
order, the accessibility tree is the same, and neither width scrolls sideways.

## Network dependencies

None for the sign-in itself. Every page load also asks the fonts from `fonts.googleapis.com` and
`fonts.gstatic.com` and sends to `events.backtrace.io`; a refused login sends the user name it was
given to the same error-reporting service (G4). Cases block those hosts (`third_party_hosts`).

## Quality dimensions

| Dimension | Applies? | Expected, or why not |
|---|---|---|
| responsive | applies | no horizontal scroll at any project; the same form at every width |
| perf | n/a | the check runs in the page with no loading state; the delay of `performance_glitch_user` is in drawing the inventory, which the inventory contract owns |
| security | applies | password masked; the same message for an unknown user and a wrong password; protected pages refuse a visitor without a session; logout and Back; nothing typed reaches the URL |
| layout | applies | the page health guard on every case; the visual case of the login page |
| navigation | applies | the redirect from a protected page; logout; the error dismissed |
| a11y | applies | axe against the baseline; keyboard order; the refusal announced as an alert |
| content | n/a | the page shows no text the user wrote back to them; the messages never repeat the user name |

## Measurements

| What | Route | Device | Date |
|---|---|---|---|
| Login with both fields empty: an `alert` with "Dismiss error" and "Epic sadface: Username is required", 2 fields marked `input_error`, URL unchanged | `/` | desktop Chromium, Pixel 7 | 2026-10-31 |
| Tab from the top: Username, Password, Login, then the page itself | `/` | desktop Chromium, Pixel 7 | 2026-10-31 |
| Focused controls: computed `outline-style: none` and no `box-shadow` | `/` | desktop Chromium, Pixel 7 | 2026-10-31 |
| `scrollWidth` equal to the viewport: 1280 and 412 | `/` | desktop Chromium, Pixel 7 | 2026-10-31 |
| `/inventory.html` without a session: back on `/` with "You can only access '/inventory.html' when you are logged in." | `/inventory.html` | desktop Chromium | 2026-10-31 |
| Hosts asked on load: the application, Google Fonts, `events.backtrace.io`; no console error | `/` | desktop Chromium, Pixel 7 | 2026-10-31 |

## Gaps and discrepancies

The local tracker has no issue about this application yet; each gap was searched there on
2026-10-31.

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | Neither field has an `autocomplete` value, and the fields have no visible label, only a placeholder that disappears when typing starts. | app map and live look, 2026-10-31 | searched, none |
| G2 | No visible focus was found on the focused controls (computed `outline-style: none`, no `box-shadow`); the page may mark focus another way, such as a border colour. | live look, 2026-10-31 | searched, none; to confirm (A1) |
| G3 | The login page has no level-1 heading; "Swag Labs" is plain text outside any landmark. | live look, 2026-10-31 | searched, none |
| G4 | Every page load sends to `events.backtrace.io`, and a refused login sends the user name typed to it. | live look (hosts) and the application's script, 2026-10-31 | searched, none |
| G5 | Logout removes only the session cookie: the cart in local storage stays for whoever signs in next on the same browser. The cart contract decides how it is tested. | the application's script, 2026-10-31 | searched, none |
| G6 | A signed-in user who opens `/` sees the form again, with no redirect. | app map as `standard`, 2026-10-31 | searched, none |
| G7 | For `locked_out_user` the page writes the session cookie before it checks the lockout; protected pages still refuse that cookie. | the application's script, 2026-10-31 | searched, none |

## Out of scope

- The other accepted users (`problem_user`, `performance_glitch_user`, `error_user`,
  `visual_user`): they sign in like `standard_user` and differ on the inventory, the cart and the
  visual lane, whose contracts and lanes own them.
- Session expiry after 10 minutes: it needs the clock (`page.clock`) and the session-timeout cases;
  the pack's actors use a cookie without expiry (`docs/app-notes.md`).
- The credentials hint below the form: the demo shows its own accounts on purpose.
- What `events.backtrace.io` receives: a third party; cases block it, and G4 records it.

## Assumptions to confirm

- A1: whether the page shows focus at all (G2). The keyboard case checks it in automate; if focus is
  not visible, G2 becomes an accessibility finding for `qa-report-bug`.
- A2: the lockout case reads `locked_out_user` from a new variable,
  `SAUCEDEMO_LOCKED_OUT_USER`, with an actor of its own in qa-config, so no user name is written in
  a spec.
- A3: REQ-LOGIN-01, -03, -04, -05 and -10 come from the application's script, not from the page;
  automate watches each one in a spec before the case is called done.
