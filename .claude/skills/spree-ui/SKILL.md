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

- Reachability: `npm run spree:up` starts Spree and its database, makes the admin of
  `SPREE_ADMIN_EMAIL` and `SPREE_ADMIN_PASSWORD` and loads the sample data once; `npm run spree:down`
  removes both containers. The application answers on `http://localhost:3100`.
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
  on. Wait for a page's rows or form, not only its heading.
- Run: `spree:up` before a run; it clears the admin's lockout. The pack's recovery restarts the
  container, which keeps the database.

## Known defects

| Key | What | Cases armed with it |
|---|---|---|
| `LOCAL-44` | dashboard documents carry no Content-Security-Policy or Permissions-Policy | the security headers sweep (`headers-known.json`) |

## Accessibility baseline

`a11y-known.json` is empty: the axe sweep has not run on the pack yet.
