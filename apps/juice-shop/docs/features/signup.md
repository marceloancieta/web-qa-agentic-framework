# Sign-up contract

| | |
|---|---|
| Pack and version | `juice-shop` `20.3.0` |
| Feature code | `SIGNUP` (case ids `TC-SIGNUP-NN`) |
| Routes | `/#/register` |
| Sources | no story or issue: intake from the application itself (JS-05). The app map (`docs/app-map.json`, 2026-10-25); a read-only look at the live application (2026-10-25, desktop Chromium); the application's own texts (`/assets/i18n/en.json`) and security questions (`GET /api/SecurityQuestions/`); the sign-up the `customer` fixture does through the API (`api/account-api.ts`) |
| Intake date | 2026-10-25 |

## Purpose

As a visitor, I fill in the registration form so that I have an account I can sign in with.

## Business rules

| ID | Rule | Source |
|---|---|---|
| REQ-SIGNUP-01 | The Register button stays disabled until every field is valid. | live look, 2026-10-25: disabled on load; the rest unobserved (design does not type into this form) |
| REQ-SIGNUP-02 | The email is required and must be an address: "Please provide an email address.", "Email address is not valid." | app map `required`; the application's texts `MANDATORY_EMAIL`, `INVALID_EMAIL` |
| REQ-SIGNUP-03 | The password has 5 to 40 characters; the page says "Password must be 5-40 characters long." | app map `minlength=5`, `maxlength=40`; the hint on the live page |
| REQ-SIGNUP-04 | The repeated password must match: "Passwords do not match". | the application's texts `PASSWORDS_NOT_MATCHING` |
| REQ-SIGNUP-05 | A security question is chosen from the list the application offers and answered: "Please select a security question.", "Please provide an answer to your security question." | `GET /api/SecurityQuestions/` (14 questions); the application's texts |
| REQ-SIGNUP-06 | A completed registration creates an account that can sign in with the email and password given. | the `customer` fixture registers and signs in through the same API; through the form, unobserved |
| REQ-SIGNUP-07 | An email already registered is refused with a message, and no second account is created. | assumption A1, to confirm in automate |
| REQ-SIGNUP-08 | Both password fields are masked (`type=password`). | app map |
| REQ-SIGNUP-09 | The form can be filled with the keyboard alone, the security question included, the focus visible in reading order. | quality checklist, WCAG 2.1 SC 2.1.1 and 2.4.7 |
| REQ-SIGNUP-10 | "Already a customer?" leads to `/#/login`. | app map links of `/#/register` |
| REQ-SIGNUP-11 | The page has no horizontal scroll on any device project, and a very long email or answer does not overflow its field. | quality checklist |

## Acceptance criteria

- **Given** the registration page, **when** a visitor fills every field with valid values and
  registers, **then** the account exists and signs in with that email and password (REQ-SIGNUP-06).
- **Given** the registration page, **when** the password has 4 characters, **then** Register stays
  disabled and the length message shows; with 5 and with 40 characters it is accepted, with 41 it is
  not (REQ-SIGNUP-01, REQ-SIGNUP-03).
- **Given** the passwords differ, **then** "Passwords do not match" shows and Register stays
  disabled (REQ-SIGNUP-04).

## Roles and entry state

`anonymous` only, in a fresh context with the pack's cookies. A case that registers creates its
account with a builder email unique to the run; the account cannot be removed (application notes)
and disappears when the container restarts.

## Elements

| Element | Notes |
|---|---|
| `heading "User Registration"` (level 1) | |
| `textbox "Email address field"` | visible label "Email" |
| `textbox "Field for the password"` | visible label "Password"; the hint and a counter below it |
| `textbox "Field to confirm the password"` | visible label "Repeat Password" |
| `switch "Show password advice"` | |
| `combobox "Selection list for the security question"` | "This cannot be changed later!" below it |
| `textbox "Field for the answer to the security question"` | placeholder "Answer to your security question" |
| `button "Button to complete the registration"` | visible text "Register"; disabled until the form is valid |
| `link "Already a customer?"` | |
| `alert` | empty on load; where a refusal of the server shows (unobserved) |

## Validations

| Field | HTML constraints (app map) | Beyond them |
|---|---|---|
| Email | `required`; a text field (no `type=email`), no `autocomplete` | the two messages of REQ-SIGNUP-02 |
| Password | `required`, `minlength=5`, `maxlength=40`, `type=password` | the hint; a counter that reads `0/20` (G1) |
| Repeat password | `required`, `type=password` | "Please repeat your password.", "Passwords do not match"; a counter `0/40` |
| Security question | a select of 14 questions | "Please select a security question." |
| Answer | `required` | "Please provide an answer to your security question." |

Partitions and boundaries for design: email empty, malformed, valid, already registered; password
length 0, 4, 5, 40, 41; repeat equal or different; question chosen or not; answer empty, one
character, very long.

## States

| State | What the page shows | How a case reaches it |
|---|---|---|
| initial | empty fields, Register disabled, the alert empty | open `/#/register` |
| invalid | the field messages, Register disabled | type invalid values (a spec run) |
| registered | `/#/login` with "Registration completed successfully…" (TC-SIGNUP-07, 2026-10-26) | a spec that registers a builder account |
| refused | stays on `/#/register`; the form's alert holds the server's "email must be unique" (TC-SIGNUP-08, 2026-10-26) | an email already registered (A1), or `failWith` (`@mocked`) |
| questions not loaded | the list opens with no option and Register stays disabled (TC-SIGNUP-17, 2026-10-26) | `failWith` or `mockJson` empty on `/api/SecurityQuestions/` (`@mocked`) |

## Navigation

Reached from "Not yet a customer?" on `/#/login`. "Already a customer?" leads back. Where a
successful registration lands is unobserved (A2).

## Responsive differences

None seen in the form: the fields stack in the same order at 1280 and 412 px. The account menu
moves to the side navigation below 960 px, as on every page.

## Network dependencies

`GET /api/SecurityQuestions/` fills the select. `api/account-api.ts` registers with one
`POST /api/Users` that carries the question and the answer, answered `201`. What the form sends is
unobserved (A3).

## Quality dimensions

| Dimension | Applies? | Expected, or why not |
|---|---|---|
| responsive | applies | no horizontal scroll at any project |
| perf | n/a | the form shows no loading state: the security questions arrive before the form can be completed, and the page has no indicator for them |
| security | applies | both password fields masked; nothing typed in the URL; an injected answer or email shown as text where it is shown back |
| layout | applies | the page health guard; the visual case of the empty form |
| navigation | applies | Register disabled until valid; the link to the login |
| a11y | applies | axe against the baseline; the keyboard through every field, the select included; messages tied to their fields |
| content | applies | boundary password lengths; a very long email and answer stay inside their fields |

## Measurements

| What | Route | Device | Date |
|---|---|---|---|
| Register disabled on load; the alert present and empty | `/#/register` | desktop Chromium | 2026-10-25 |
| The password hint "Password must be 5-40 characters long." and the counters `0/20` and `0/40` | `/#/register` | desktop Chromium | 2026-10-25 |
| `GET /api/SecurityQuestions/` answered 14 questions | `/#/register` | desktop Chromium | 2026-10-25 |

## Gaps and discrepancies

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | The password counter reads `/20` while the field and its hint allow 40 characters. | live look and app map, 2026-10-25 | LOCAL-4 (S3) |
| G2 | The email field has no `type=email`, and no field has an `autocomplete` value. | app map, 2026-10-25 | searched, none |

## Out of scope

- "Show password advice": what the advice says is the application's text, not a rule of
  registration.
- The security answer's later use (resetting a password) belongs to the forgot-password feature.

## Assumptions to confirm

- A1: an email already registered is refused with a message in the alert (REQ-SIGNUP-07).
  Held (TC-SIGNUP-08, 2026-10-26): the form's alert says "email must be unique", the page stays on
  `/#/register` and the second password does not sign in.
- A2: a successful registration moves to `/#/login` with a confirmation message. Held (TC-SIGNUP-07,
  2026-10-26): "Registration completed successfully…".
- A3: the form sends the same `POST /api/Users` as the API client. Held (TC-SIGNUP-07, 2026-10-26):
  `POST /api/Users/` (201), then `POST /api/SecurityAnswers/` (201), then the move to the login.
