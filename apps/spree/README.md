# Spree Commerce admin pack

The admin dashboard of [Spree Commerce](https://spreecommerce.org) 6, run locally in Docker (the
`spree` and `spree-db` services of [`docker/compose.yml`](../../docker/compose.yml), pinned by
digest), with the mail catcher `mailpit` that receives every email Spree sends (ADR 0014). The
storefront is not part of the pack.

Created by `npm run scaffold:app`. Still to fill in, through the phases:

- [x] `app.json`: the `sidebar` breakpoint (768 px)
- [ ] `app.json`: `third_party_hosts` to block, extra `secret_keys` and `identity_fields`
- [x] `fixtures.ts`: staff of limited roles, provisioned through the admin API

## Features

| Feature | Contract |
|---|---|
| `LOGIN` | [admin sign-in](docs/features/login.md) |
| `ROLES` | [staff roles](docs/features/roles.md) |
| `PWRESET` | [admin password reset](docs/features/password-reset.md) |

## Layout

| Path | Holds |
|---|---|
| `fixtures.ts` | the `admin` actor, and the provisioned `staff`, `orders-reader` and `catalog-editor` (a role, an invitation and its acceptance through the admin API, removed when the worker ends), each signed in through the admin API once per context (`singleUseSessions`) |
| `api/auth-api.ts` | the admin sign-in, the access token and the single-use refresh cookie; `whoami` reads a context's session |
| `api/staff-api.ts`, `api/catalog-api.ts` | roles, invitations and members; the status of a section's list; the products' names |
| `builders/staff-builder.ts` | members, their names and roles, each actor's permissions, unknown addresses |
| `builders/password-builder.ts` | passwords of a chosen length, tokens Spree never issued |
| `pages/`, `components/` | the login, the forgot and reset password pages, a dashboard section, the settings, the page of a member without a store; the sidebar and the user menu |
| `flows/password-reset.ts` | asking for a reset and taking the link from the member's email in the mail catcher |
| `mocks/auth-mocks.ts` | a delayed sign-in answer, and a count of the sign-ins, reset requests and password changes sent |
| `rules/TC-ROLES-07.yaml` | the admin API's answer per role and section |
| `registry/`, `specs/login/`, `specs/roles/`, `specs/password-reset/` | the LOGIN, ROLES and PWRESET cases and their specs |
| `docs/app-map.json`, `docs/app-map.admin.json` | the app maps, anonymous and as the admin |
| `docs/app-notes.md` | sessions, the store's ids, the sample data, page behaviour |

## Running it

```sh
npm run spree:up                    # start Spree and Mailpit, make the admin, load the sample data once
npx playwright test --project='spree-*'
npm run spree:down                  # remove the containers; the next start is empty
```

`spree:up` ([`scripts/spree-up.mjs`](../../scripts/spree-up.mjs)) reads the admin's email and
password from the variables the `admin` actor names in qa-config (`SPREE_ADMIN_EMAIL`,
`SPREE_ADMIN_PASSWORD` in `.env`), creates that admin with the admin role of the store, sets the
password again when it differs and clears a lockout. A Spree that is already running keeps its data.
The application answers on `http://localhost:3100`, the dashboard under `/dashboard`. The mail
catcher's page and API answer on `http://localhost:8025`, the `mail_catcher` of the pack's entry in
qa-config; it keeps messages in memory, so a restart empties it.
