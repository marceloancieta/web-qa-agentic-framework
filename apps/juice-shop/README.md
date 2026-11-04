# Juice Shop pack

[OWASP Juice Shop](https://owasp.org/www-project-juice-shop/) is a web shop that is insecure on
purpose, built for security training. It runs locally from its official image, pinned by digest in
[`docker/compose.yml`](../../docker/compose.yml), and is the pack where every part of the framework
is shown: the five phases, actors, mocks, accessibility and visual checks.

Its vulnerabilities belong to the Juice Shop project; finding them is what it is for. A defect of
this framework is reported here.

## Running it

```sh
npm run juice-shop:up                       # start the container and wait until it is healthy
npx playwright test --project='juice-shop-*'
npm run juice-shop:down                     # stop it; the next start has an empty database
```

To watch a run, open the browser and slow every action down (`QA_SLOWMO`, in milliseconds), or step
through it with `--debug`, or replay it action by action with `--ui`:

```sh
QA_SLOWMO=800 npx playwright test --project=juice-shop-desktop-chromium --headed --workers=1
```

The `local` environment of `qa-config.example.json` points the pack at `http://localhost:3000`,
allows writes and restarts the container as the recovery of destructive cases.

## Sessions

| Actor | Account | How it signs in |
|---|---|---|
| `customer` | created during the run, one per worker (`builders/account-builder.ts`) | `POST /rest/user/login`; the token goes to local storage and a `token` cookie, the basket id to session storage, as the frontend does after its own login |
| `anonymous` | none | a fresh context |

Every context carries the cookies of `app.json` `cookies`: they dismiss the welcome and cookie
banners and fix the language. Accounts are not removed; the [application notes](docs/app-notes.md) say why.

## Layout

| Folder | Holds |
|---|---|
| `api/` | `AccountApi` (sign-up, login, the signed-in account), `BasketApi`, `CatalogueApi` (products, and the most stocked ones a run can order), `CheckoutApi` (addresses, cards, delivery methods, orders, tracking) |
| `builders/` | accounts with a unique email and a random password; addresses and fake cards (numbers starting 9000) |
| `pages/` | the login, registration, search and basket pages and each checkout step, from the address to the order history |
| `components/` | `AccountMenu`: one API for the toolbar menu (from 960 px wide, `breakpoints.toolbar`) and the side navigation below it; `Toolbar`: the search box and the basket button |
| `flows/` | `shopping.ts`: sign in and register through the forms, search and add, and each checkout step, shared by the journeys and the feature specs |
| `mocks/` | `checkout-mocks.ts`: a failed address save, a slow basket or order answer |
| `specs/smoke/` | the harness smoke: a customer starts signed in through the API, and the API client shares its session, on every device project |
| `specs/login/`, `specs/signup/`, `specs/basket/`, `specs/search/` | each feature's automated cases |
| `specs/journeys/`, `specs/checkout/` | the journeys (`@e2e`) and the checkout cases |
| `specs/a11y/` | the accessibility sweep (`@a11y-sweep`): every route of the app maps, as each map's role, against `a11y-known.json`; only `QA_A11Y_SWEEP=1` selects it (`helpers/a11y-sweep.ts`) |
| `specs/perf/` | the web vitals (`@web-vitals`) of the product list and the login page, against the environment's budget; only `npm run lanes:web-vitals` selects them (ADR 0012) |
| `specs/visual/`, `visual/` | the visual cases and their baselines, one per device project, rendered in the pinned image: `npm run lanes:visual` compares, `npm run lanes:visual -- --phase automate --update` rewrites them (ADR 0009) |
| `visual.css` | parts hidden in every visual comparison because they change between starts, such as the cards' stock ribbons (`app.json` `visual.stylePath`) |
| `docs/app-map.json` | the app map: `npm run app:map -- --pack juice-shop --write` walks the routes of `app.json` `app_map` read-only; `npm run app:map:check -- --pack juice-shop` reports drift |
| `docs/app-map.customer.json` | the same walk signed in as `customer`, plus the basket and checkout routes of `app.json` `app_map.actors.customer`: `--actor customer` with either command, after a spec run that signed a customer in |

## Features

| Feature | Contract | Registry |
|---|---|---|
| `LOGIN` | [sign-in](docs/features/login.md) | [sign-in cases](registry/login.md) |
| `SIGNUP` | [sign-up](docs/features/signup.md) | [sign-up cases](registry/signup.md) |
| `BASKET` | [basket](docs/features/basket.md) | [basket cases](registry/basket.md) |
| `SEARCH` | [product search](docs/features/search.md) | [search cases](registry/search.md) |
| `CHECKOUT` | [checkout](docs/features/checkout.md) | [checkout cases](registry/checkout.md) |
| `JOURNEY` | [journeys](docs/features/journeys.md), across the features above | [journey cases](registry/journeys.md), tagged `@e2e` |

## Facts about the application

What the application does that its pages do not show (the breakpoint of the account menu, the
generic login message, where a login lands, why accounts stay) is in
[`docs/app-notes.md`](docs/app-notes.md). What an agent needs before working on the pack is in its
skill, [`juice-shop-ui`](../../.claude/skills/juice-shop-ui/SKILL.md).
