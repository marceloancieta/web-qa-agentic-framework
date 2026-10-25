---
name: juice-shop-ui
description: Facts about OWASP Juice Shop that the app map does not show - sessions, page behaviour, limits. Read before designing, automating or running cases of the juice-shop pack.
---

# OWASP Juice Shop

A web shop that is insecure on purpose, built for security training, run locally from its official
image pinned by digest in `docker/compose.yml`. The `local` environment allows writes and restarts
the container as the recovery of destructive cases. It is the fully worked pack: every phase,
actors, mocks, accessibility and visual checks. Its vulnerabilities belong to the Juice Shop
project; finding them is what it is for, and they are reported to this framework only when a case
depends on one.

## Before you start

- Reachability: `npm run juice-shop:up` starts the container and waits until it is healthy. If
  Docker is not running, say so and wait.
- Configuration: the pack's entry under `app.environments.<env>.packs.juice-shop` in qa-config.
- The pack's map: `apps/juice-shop/README.md`; the app map: `apps/juice-shop/docs/app-map.json`,
  with the routes it walks in `apps/juice-shop/app.json` `app_map`.

## Sessions

| Role | Account | How it signs in | What the session leaves behind |
|---|---|---|---|
| `anonymous` | none | a fresh context | the banner and `language` cookies of `apps/juice-shop/app.json` `cookies`, which every context gets |
| `customer` | created during the run, one per worker (`apps/juice-shop/builders/account-builder.ts`) | `POST /rest/user/login` through `apps/juice-shop/api/account-api.ts` | the token in local storage and a `token` cookie, the basket id (`bid`) in session storage |

The fixture writes the signed-in state of each worker under `.auth/<env>/juice-shop/`, the basket
id included. Design maps the signed-in routes with it,
`npm run app:map -- --pack juice-shop --actor customer --write`, into
`apps/juice-shop/docs/app-map.customer.json`, and never signs up an account of its own. Any spec
run with the `customer` fixture, such as the smoke, leaves a fresh state for it.

## Application notes

Read `apps/juice-shop/docs/app-notes.md` before designing: it holds what the application does that
its pages do not show, each fact with how it was observed. This skill does not repeat those facts;
it says what they change for each phase below.

## Devices

`breakpoints.toolbar` is 960 px. From there up the account is a toolbar button, below it a section
of the side navigation; `apps/juice-shop/components/account-menu.ts` hides the difference behind one
API, so a spec never branches on the device.

## What each phase must know

- Intake and design: the login form is the one form design may fill. The sign-up, basket, address
  and payment forms all write; their states after a submit are unobserved until a spec or a run
  shows them.
- Automate: accounts a spec creates cannot be removed, so every case asserts on its own account and
  never on counts or listings other runs share. The login message does not say which field was
  wrong, so a case checks the generic text. A login through the form lands on `/#/search`; wait for
  that route before the next step.
- Run: a restart (the pack's `recovery`, or `npm run juice-shop:down` then `juice-shop:up`) empties
  the database, so data a run needs is created by the run.

## Known defects

Filed in the local tracker at the W6 intake gate (2026-10-25). Juice Shop's training
vulnerabilities are filed like any defect, so the cases that check them run as known gaps.

| Key | What | Cases armed with it |
|---|---|---|
| LOCAL-1 (S1) | a customer reads another customer's basket by its id (REQ-BASKET-09) | none yet: designed in W6b |
| LOCAL-2 (S2) | the search term is rendered as markup (REQ-SEARCH-04) | none yet: designed in W6b |
| LOCAL-3 (S3) | `/#/basket` opens without a session (REQ-BASKET-10) | none yet: designed in W6b |

## Accessibility baseline

The pack has no baseline file yet. The first accessibility cases (JS-05, JS-06) create it, and each
known violation gets a tracker key and an expiry.
