# Swag Labs pack

The public Swag Labs demo shop, tested read-only: qa-config gives it `allow_writes: false`, and
the application has no server state to change. Its login, product list and cart run in the browser,
so the pack signs its actors in and prepares their cart by building the cookie and the local
storage the application reads (`docs/app-notes.md`).

## Running it

```sh
npx playwright test --project='saucedemo-*'
```

The `standard` actor needs `SAUCEDEMO_STANDARD_USER` and `SAUCEDEMO_PASSWORD` in the environment
or the local `.env`; `.env.example` says where their values come from.

## Sessions

- `anonymous`: a fresh context, no cookie.
- `standard` (`fixtures.ts`): the `session-username` cookie the application writes after a login,
  built from the account's user name. It lasts for the browser session, while the application's
  own cookie expires after 10 minutes. Only the login cases type a password.

## Layout

| Path | Holds |
|---|---|
| `app.json` | the pack manifest; version `live`, since the public site publishes none |
| `fixtures.ts` | the pack's `test` and the `standard` fixture |
| `pages/` | `home-page.ts`, `inventory-page.ts` |
| `specs/smoke/` | the home page smoke and the sign-in smoke of the harness (no case ids) |
| `specs/a11y/` | the accessibility sweep over the app maps |
| `specs/perf/` | the web vitals (`@web-vitals`) of the login page, a few anonymous visits; only `npm run lanes:web-vitals` selects them (ADR 0012) |
| `docs/app-map.json`, `docs/app-map.standard.json` | the app map, anonymous and as `standard` |
| `docs/app-notes.md` | where the application departs from what its pages show |

## Features

| Feature | Contract | Registry |
|---|---|---|
| `LOGIN` | [sign-in](docs/features/login.md) | [sign-in cases](registry/login.md) |
| `INVENTORY` | [product list](docs/features/inventory.md) | [product list cases](registry/inventory.md) |
| `CART` | [cart](docs/features/cart.md) | [cart cases](registry/cart.md) |
