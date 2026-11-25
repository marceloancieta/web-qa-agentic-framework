---
name: spree-ui
description: Facts about Spree Commerce admin that the app map does not show - sessions, page behaviour, limits. Read before designing, automating or running cases of the spree pack.
---

# Spree Commerce admin

The admin dashboard of Spree Commerce 6, its API behind it, run locally in Docker by
`npm run spree:up` (the storefront is not part of the pack). The local environment allows writes:
cases create the roles, staff and data they need through the admin API and remove them. The pack
shows authorization in the UI by role, and a session that cannot be shared between contexts.

## Before you start

- Reachability: `npm run spree:up` starts Spree, its database and the mail catcher (Mailpit), makes
  the admin of `SPREE_ADMIN_EMAIL` and `SPREE_ADMIN_PASSWORD` and loads the sample data once;
  `npm run spree:down` removes the three containers. The application answers on
  `http://localhost:3100`, the mail catcher on `http://localhost:8025` (qa-config `mail_catcher`).
- Configuration: the pack's entry under `app.environments.<env>.packs.spree` in qa-config.
- The pack's map: `apps/spree/README.md`; the app maps: `apps/spree/docs/app-map.json` and
  `apps/spree/docs/app-map.admin.json`.

## Sessions

| Role | Account | How it signs in | What the session leaves behind |
|---|---|---|---|
| `anonymous` | none | a fresh context | nothing |
| `admin` | existing, from `SPREE_ADMIN_EMAIL` and `SPREE_ADMIN_PASSWORD`, made by `spree:up` | `POST /api/v3/admin/auth/login`, once per context (single-use sessions) | the `spree_admin_refresh_token` cookie; the access token as the API client's `Authorization` header |

## Application notes

Read `apps/spree/docs/app-notes.md` before designing: it holds what the application does that its
pages do not show, each fact with how it was observed. This skill does not repeat those facts; it
says what they change for each phase below.

## Devices

`app.json` declares no breakpoints yet. The login is the same at 1280 px and 412 px; on mobile the
dashboard's sidebar sits behind "Toggle Sidebar".

## What each phase must know

- Intake and design: map signed in with `npm run app:map -- --pack spree --actor admin`, after a
  spec run wrote the admin's state; each state works for one walk (single-use sessions), so run a
  spec again before the next walk. The walk lets the session refresh through
  (`app_map.session_writes`) and blocks every other write. Never fail a sign-in or sign out with the
  admin: a lockout or a revoked session stops every worker.
- Automate: a case that types a password, fails a sign-in or signs out uses a staff account of its
  own, made and removed through the admin API. Take the store's route from the page a sign-in lands
  on. Wait for a page's rows or form, not only its heading. Mail is read with the `mail` fixture
  (ADR 0014): a provisioned member already has an invitation email, so pick messages by subject, and
  pass `except` when the case asks for a second email of the same kind. The reset email's link lacks
  `/dashboard` (LOCAL-67): `ResetPasswordPage.openLink` opens its token on the dashboard's page until
  that is fixed.
- Run: `spree:up` before a run; it clears the admin's lockout. The pack's recovery restarts the
  container, which keeps the database. `npm run lanes:zap -- --pack spree` never scans that Spree:
  it starts `spree-scan` on a database of its own (`spree-scan-db`), empty and on no host port, and
  removes both afterwards. The dashboard is a single-page application, so the spider, which runs no
  script, reaches its documents and assets only.

## Known defects

| Key | What | Cases armed with it |
|---|---|---|
| `LOCAL-44` | dashboard documents carry no Content-Security-Policy or Permissions-Policy | the security headers sweep (`headers-known.json`), the ZAP lane (`zap-known.json`) |
| `LOCAL-45` | login: the refusal and field messages are not announced to screen readers (S2) | TC-LOGIN-19, TC-PWRESET-22 |
| `LOCAL-46` | login: Email and Password have no `autocomplete` and no `required` (S3) | TC-LOGIN-20, TC-PWRESET-23 |
| `LOCAL-47` | write controls shown to roles that cannot write; the store refuses the write (S3) | TC-ROLES-14 |
| `LOCAL-48` | a section the role cannot read shows an empty table with no refusal message (S3) | TC-ROLES-15 |
| `LOCAL-49` | product pages' "Shop location" links omit `/dashboard` and land on a 404 (S3) | none |
| `LOCAL-50` | login: the lockout message tells which emails have a staff account (S3) | TC-LOGIN-08 |
| `LOCAL-51` | tables: the "Rows per page" select has no accessible name (S2) | the accessibility sweep (`a11y-known.json`) |
| `LOCAL-52` | reports and dashboard: the progress bars have no accessible name (S2) | the accessibility sweep (`a11y-known.json`) |
| `LOCAL-53` | product page: the media thumbnails are buttons that contain other controls (S2) | the accessibility sweep (`a11y-known.json`) |
| `LOCAL-54` | product page: the backorder switches of the stock table sit inside another control (S2) | the accessibility sweep (`a11y-known.json`) |
| `LOCAL-55` | settings: the collapsed sidebar wraps each section link in a menu button (S2) | the accessibility sweep (`a11y-known.json`) |
| `LOCAL-56` | tables on narrow screens: a table that scrolls sideways cannot be scrolled with the keyboard (S2) | the accessibility sweep (`a11y-known.json`) |
| `LOCAL-57` | new order: the button of a combobox field has no accessible name (S3) | the accessibility sweep (`a11y-known.json`) |
| `LOCAL-58` | API keys: the "Never" of the last-used column has too little contrast (S3) | the accessibility sweep (`a11y-known.json`) |
| `LOCAL-59` | not a defect: ZAP rule 10096 reads constants of the dashboard bundle as Unix timestamps | the ZAP lane (`zap-known.json`) |
| `LOCAL-67` | password reset: the link in the email omits `/dashboard` and answers 404, like `LOCAL-49` (S2) | TC-PWRESET-05 |
| `LOCAL-68` | reset password page: no heading, and the title does not name the page (S3) | TC-PWRESET-21 |
| `LOCAL-69` | reset password page: a dead link shows the form and is refused only on submit (S4) | TC-PWRESET-24 |

## Accessibility baseline

`a11y-known.json` holds what the axe sweep of the app maps found when it first ran (SP-01): one
entry per rule and target, each with the key above, the route it applies to (`*` for every route)
and an expiry. The sweep fails on a violation the file does not list.
