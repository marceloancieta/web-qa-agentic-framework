# Sign-in contract

| | |
|---|---|
| Pack and version | `juice-shop` `20.3.0` |
| Feature code | `LOGIN` (case ids `TC-LOGIN-NN`) |
| Routes | `/#/login` |
| Sources | no story or issue: intake from the application itself (JS-05). The app map (`docs/app-map.json`, `docs/app-map.customer.json`, 2026-10-25); read-only looks at the live application (2026-10-25, desktop Chromium 1280 px and 412 px wide); the application's own texts (`/assets/i18n/en.json`); the sign-in smoke (`specs/smoke/sign-in.spec.ts`, 2026-10-24) |
| Intake date | 2026-10-25 |

## Purpose

As a customer, I enter my email and password on the login page so that I am signed in and can shop
with my account.

## Business rules

| ID | Rule | Source |
|---|---|---|
| REQ-LOGIN-01 | An existing account signs in with its email and password, lands on `/#/search` and sees its email in the account menu. | sign-in smoke, 2026-10-24 |
| REQ-LOGIN-02 | A wrong password and an unknown email get the same message, "Invalid email or password.", announced as an alert, and the page stays on `/#/login`. | live look, unknown email, 2026-10-25; sign-in smoke, wrong password |
| REQ-LOGIN-03 | The Log in button is disabled until both fields have a value. | live look, 2026-10-25: disabled on load, enabled with both filled |
| REQ-LOGIN-04 | A field left empty after it was focused says what is missing: "Please provide an email address.", "Please provide a password." | live look, 2026-10-25 |
| REQ-LOGIN-05 | The password is masked while typed (`type=password`), and "Show password" reveals it. | app map field type; the button on the live page |
| REQ-LOGIN-06 | The form can be filled and sent with the keyboard alone, the focus visible on each control in reading order. | quality checklist, WCAG 2.1 SC 2.1.1 and 2.4.7 |
| REQ-LOGIN-07 | A signed-in session survives a reload of the page. | live look with the `customer` state, 2026-10-25 |
| REQ-LOGIN-08 | "Not yet a customer?" leads to `/#/register` and "Forgot your password?" to `/#/forgot-password`. | app map links of `/#/login` |
| REQ-LOGIN-09 | The page has no horizontal scroll on any device project. | quality checklist |

## Acceptance criteria

- **Given** an account created for the run, **when** its owner signs in through the form with the
  right password, **then** the page moves to `/#/search` and the account menu shows the email
  (REQ-LOGIN-01).
- **Given** the login page, **when** someone signs in with an email no account has, or with a wrong
  password, **then** the same alert says "Invalid email or password." and the URL stays
  `/#/login` (REQ-LOGIN-02).
- **Given** the login page with empty fields, **when** only one field has a value, **then** Log in
  stays disabled (REQ-LOGIN-03).

## Roles and entry state

- `anonymous`: a fresh context with the pack's cookies (banners dismissed, English).
- `customer`: an account created during the run (`builders/account-builder.ts`). The login case is
  the one that types its password; every other case starts signed in through the API (the
  `customer` fixture).

## Elements

| Element | Notes |
|---|---|
| `heading "Login"` (level 1) | |
| `textbox "Text field for the login email"` | visible label "Email" |
| `textbox "Text field for the login password"` | visible label "Password" |
| `button "Show password"` | |
| `button "Login"` | visible text "Log in"; disabled while a field is empty |
| `checkbox "Checkbox to stay logged in or not logged in"` | visible text "Remember me" |
| `button "Login with Google"` | out of scope |
| `link "Forgot your password?"`, `link "Not yet a customer?"` | |
| `alert` | holds "Invalid email or password." after a refused login |

## Validations

| Field | HTML constraints (app map) | Beyond them (live look) |
|---|---|---|
| Email | `required`; no `type` attribute (a text field), no `autocomplete` | "Please provide an email address." once focused and left empty |
| Password | `required`, `minlength=1`, `type=password`, no `autocomplete` | "Please provide a password." once focused and left empty |

The application checks the pair only on submit: `POST /rest/user/login` refuses it with `401`,
whether the email has no account or the password is wrong, and the page shows the generic alert.

## States

| State | What the page shows | How a case reaches it |
|---|---|---|
| initial | both fields empty, Log in disabled | open `/#/login` |
| incomplete | field messages, Log in disabled | focus and leave a field |
| refused | the alert, the URL unchanged | an unknown email or a wrong password |
| signed in | `/#/search`, the account menu with the email | an account created for the run |
| waiting for the answer | unobserved: the request answers in a few ms locally | `delay` on `/rest/user/login`, which holds the real answer (no `@mocked`) |
| server error | stays on `/#/login` with no session; the alert reads "[object Object]" with the mock's JSON body (TC-LOGIN-15, 2026-10-26; LOCAL-19, unconfirmed with a real server error) | `failWith` on `/rest/user/login` (`@mocked`) |

## Navigation

Reached from the account menu's Login entry and from the link on `/#/register`. After a login it
moves to `/#/search`. `/#/login` stays reachable for a signed-in customer and shows the form again
(G2, accepted by the owner). Reload keeps a session (REQ-LOGIN-07).

## Responsive differences

From 960 px wide (`breakpoints.toolbar`) the account menu is a toolbar button; below, a section of
the side navigation. `components/account-menu.ts` gives one API for both, so the cases run on every
device project with no branch. The form itself has the same fields and order at both widths.

The WebKit projects (desktop-webkit, tablet, mobile-safari) cannot walk the keyboard order through
the "Forgot your password?" link: WebKit, like Safari, leaves links out of the Tab order, and the
WebKit build Playwright runs on Windows reaches no link with Alt+Tab either (probed 2026-10-30). This
is the engine, not the page, so the keyboard-order case (TC-LOGIN-07) is `not-webkit`.

## Network dependencies

`POST /rest/user/login` (the only write; design may send it), then `GET /rest/user/whoami` for the
account menu. Every page also loads `/rest/admin/application-configuration`, the languages and
`/api/Challenges/`.

## Quality dimensions

| Dimension | Applies? | Expected, or why not |
|---|---|---|
| responsive | applies | no horizontal scroll at any project; the account menu in the toolbar or the side navigation |
| perf | n/a | the form shows no loading state: the answer replaces the form in a few ms, and a delayed answer only keeps the page as it is (to confirm with `delay` in automate: TC-LOGIN-14) |
| security | applies | password masked; the same message for a wrong password and an unknown email; nothing sensitive in the URL after a refused or a successful login |
| layout | applies | the page health guard on every case; the visual case of the login page |
| navigation | applies | Log in disabled until both fields have a value; the links; reload keeps a session |
| a11y | applies | axe against the baseline; the keyboard order and visible focus; the refusal announced as an alert |
| content | n/a | the page shows no text the user wrote back to them |

## Measurements

| What | Route | Device | Date |
|---|---|---|---|
| Unknown email: `POST /rest/user/login` answered `401`, the alert read "Invalid email or password.", the URL stayed `/#/login` | `/#/login` | desktop Chromium | 2026-10-25 |
| Log in disabled with empty fields, enabled with both filled | `/#/login` | desktop Chromium | 2026-10-25 |
| Focusing and leaving the empty fields showed both messages | `/#/login` | desktop Chromium | 2026-10-25 |
| Signed in as `customer`, `/#/login` still showed the form | `/#/login` | desktop Chromium | 2026-10-25 |

## Gaps and discrepancies

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | The email field has no `type=email`, and neither field has an `autocomplete` value, so browsers and password managers get no hint (security checklist). | app map, 2026-10-25 | searched, none |
| G2 | A signed-in customer can open `/#/login` and sees the form, with no redirect. The owner would rather send a signed-in customer to the home page, and accepts the form as it is (2026-10-25); no case checks it. | live look, 2026-10-25 | searched, none; accepted |

## Out of scope

- "Login with Google": it hands over to a third party, which the walk and the cases block.
- "Remember me": what it changes shows only after the browser closes or a session expires; it
  waits for the session-timeout cases (`page.clock`).
- Two-factor login: v0.2 (architecture section 6b).
- Lockout after repeated failures: nothing on the page or in its texts mentions one.

## Assumptions to confirm

- A1: a delayed login answer shows no loading indicator (perf `n/a`). Checked with `delay` (TC-LOGIN-14) in
  automate; if an indicator appears, perf applies.
