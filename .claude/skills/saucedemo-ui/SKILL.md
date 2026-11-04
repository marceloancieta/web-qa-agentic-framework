---
name: saucedemo-ui
description: Facts about Swag Labs that the app map does not show - sessions, page behaviour, limits. Read before designing, automating or running cases of the saucedemo pack.
---

# Swag Labs

The public Swag Labs demo shop at its `base_url` in qa-config. It is read-only in every environment
(`allow_writes: false`): the shop keeps no state on a server, so its login, cart and products live
in the browser. The pack demonstrates state injection (a session cookie and the cart in local
storage instead of an API), the visual lane failing on purpose with `visual_user`, specs that hold
up under `performance_glitch_user`, and the lockout of `locked_out_user`.

## Before you start

- Reachability: a public site. When it does not answer, check the network, a proxy or a VPN first;
  a timeout is not a defect of the application. Nothing local can be started for it.
- Configuration: the pack's entry under `app.environments.<env>.packs.saucedemo` in qa-config.
- The pack's map: `apps/saucedemo/README.md`; the app maps: `apps/saucedemo/docs/app-map.json` and
  `app-map.standard.json`.

## Sessions

| Role | Account | How it signs in | What the session leaves behind |
|---|---|---|---|
| `anonymous` | none | a fresh context | nothing |
| `standard` | existing, from `SAUCEDEMO_STANDARD_USER` and `SAUCEDEMO_PASSWORD` | the `session-username` cookie built by `fixtures.ts`; the form only in the login cases | the cookie; the cart in local storage (`cart-contents`), which Logout keeps |

## Application notes

Read `apps/saucedemo/docs/app-notes.md` before designing: it holds what the application does that its
pages do not show, each fact with how it was observed. This skill does not repeat those facts; it
says what they change for each phase below.

## Devices

`app.json` declares no breakpoints. The product list has two columns on desktop and one on a phone;
every other page keeps its elements and order at every width.

## What each phase must know

- Intake and design: map signed in with `npm run app:map -- --pack saucedemo --actor standard`
  after a spec run wrote the session. Do not press "Add to cart", "Remove" or a menu entry, and do
  not submit the login with a wrong pair: a refused login sends the typed user name to a third
  party. Prepare a cart by writing local storage in a context of your own, and read the rest from
  the application's script as text.
- Automate: block the error-reporting host on every case; wait for the product list, never for a
  time (`performance_glitch_user` blocks the page for seconds); a case with products in the cart
  writes local storage before the page opens; only the login cases type a password.
- Run: nothing to recover. Each context starts empty, and the site keeps no state between runs.

## Known defects

| Key | What | Cases armed with it |
|---|---|---|
| LOCAL-26 | no control shows a visible keyboard focus | TC-LOGIN-09 |
| LOCAL-27 | every page but the login is answered `404` when opened directly | TC-INVENTORY-15 |
| LOCAL-28 | "Reset App State" leaves the open page showing the old cart until a reload | TC-CART-10 |
| LOCAL-29 | Logout leaves the cart for the next sign-in on the same browser | TC-CART-12 |
| LOCAL-30 | the cart button is named "Cart, 1 items" with one product | TC-CART-15 |
| LOCAL-33 | the documents carry none of the security headers, Strict-Transport-Security included | the headers sweep, through every entry of `apps/saucedemo/headers-known.json` |

The site is public, so the ZAP lane refuses it whatever the environment says; its headers are read
only by the headers sweep, which opens pages like any case.

The other gaps of the login, product list and cart contracts are recorded in the contracts and not
filed.

## Accessibility baseline

`a11y-known.json` is empty until the first sweep. The contracts expect findings on missing headings,
duplicated product names, the placeholder-only fields and the cart button's "1 items".
