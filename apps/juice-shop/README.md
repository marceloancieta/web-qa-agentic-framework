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

The `local` environment of `qa-config.example.json` points the pack at `http://localhost:3000`,
allows writes and restarts the container as the recovery of destructive cases.

## Sessions

| Actor | Account | How it signs in |
|---|---|---|
| `customer` | created during the run, one per worker (`builders/account-builder.ts`) | `POST /rest/user/login`; the token goes to local storage and a `token` cookie, the basket id to session storage, as the frontend does after its own login |
| `anonymous` | none | a fresh context |

Every context carries the cookies that dismiss the welcome and cookie banners, and a `language`
cookie. Accounts are not removed; the [application notes](docs/app-notes.md) say why.

## Layout

| Folder | Holds |
|---|---|
| `api/` | `AccountApi`: sign-up, login, the signed-in account |
| `builders/` | accounts with a unique email and a random password |
| `pages/` | `LoginPage` |
| `components/` | `AccountMenu`: one API for the toolbar menu (from 960 px wide, `breakpoints.toolbar`) and the side navigation below it |
| `specs/smoke/` | the sign-in smoke on every device project |
| `specs/visual/`, `visual/` | the visual cases and their baselines, one per device project, rendered in the pinned image: `npm run lanes:visual` compares, `npm run lanes:visual -- --phase automate --update` rewrites them (ADR 0009) |
| `docs/app-map.json` | the app map: `npm run app:map -- --pack juice-shop --write` walks the routes of `app.json` `app_map` read-only; `npm run app:map:check -- --pack juice-shop` reports drift |

## Facts about the application

What the application does that its pages do not show (the breakpoint of the account menu, the
generic login message, where a login lands, why accounts stay) is in
[`docs/app-notes.md`](docs/app-notes.md). What an agent needs before working on the pack is in its
skill, [`juice-shop-ui`](../../.claude/skills/juice-shop-ui/SKILL.md).
