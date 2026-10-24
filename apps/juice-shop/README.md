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

Every context carries the cookies that dismiss the welcome and cookie banners. Accounts are not
removed: the application has no endpoint for it, and a restart empties its database.

## Layout

| Folder | Holds |
|---|---|
| `api/` | `AccountApi`: sign-up, login, the signed-in account |
| `builders/` | accounts with a unique email and a random password |
| `pages/` | `LoginPage` |
| `components/` | `AccountMenu`: one API for the toolbar menu (from 960 px wide, `breakpoints.toolbar`) and the side navigation below it |
| `specs/smoke/` | the sign-in smoke on every device project |
| `docs/app-map.json` | the app map: `npm run app:map -- --pack juice-shop --write` walks the routes of `app.json` `app_map` read-only; `npm run app:map:check -- --pack juice-shop` reports drift |

## Facts about the application

- From 960 px wide the toolbar has an account button; below that the account is a section of the
  side navigation. The tablet project (810 px) gets the side navigation, the landscape tablet
  (1080 px) the toolbar.
- A login with a wrong password answers "Invalid email or password." whichever part was wrong.
- After a login through the form the application moves to `#/search`.
