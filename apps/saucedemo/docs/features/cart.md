# Cart contract

| | |
|---|---|
| Pack and version | `saucedemo` `live` |
| Feature code | `CART` (case ids `TC-CART-NN`) |
| Routes | `/cart.html`, `/inventory.html` and `/inventory-item.html` (where products are added and removed) |
| Sources | no story or issue: intake from the application itself (SD-01). The app map (`docs/app-map.standard.json`, 2026-10-31); read-only looks at the live application as `standard` with the cart prepared in local storage (2026-10-31, desktop Chromium 1280 px and Pixel 7 412 px wide); the application's script read as text (`/assets/index-*.js`, 2026-10-31) |
| Intake date | 2026-10-31 |

## Purpose

As a signed-in shopper, I put products in my cart and take them out again so that I check out with
exactly what I want.

## Business rules

| ID | Rule | Source |
|---|---|---|
| REQ-CART-01 | "Add to cart" on the list or on a product page puts the product in the cart once: its button becomes "Remove", the badge on the cart counts the products, and the cart button is named "Cart, <n> items". | the application's script; live look of the list, a product page and the badge with the cart prepared, 2026-10-31 |
| REQ-CART-02 | "Remove" on the list, a product page or the cart takes the product out: its button on the list becomes "Add to cart" again, the badge counts one less and disappears at zero, and the cart button is named "Cart, empty". | the application's script; live look of an empty cart, 2026-10-31 |
| REQ-CART-03 | The cart page lists each product in it with quantity 1, its name, description, price and "Remove", in the order the products were added. | live look with two products, 2026-10-31 |
| REQ-CART-04 | An empty cart shows only the column labels, "Continue Shopping" and "Checkout". | live look, 2026-10-31 |
| REQ-CART-05 | The cart is kept across pages and a reload: it lives in the browser, not in the page. | live look (the prepared cart on the list, a product page and the cart), 2026-10-31; the application's script |
| REQ-CART-06 | A product's name in the cart opens its product page. | live look (`button "View details for <product>"`), 2026-10-31; the application's script |
| REQ-CART-07 | "Continue Shopping" leads to `/inventory.html` and "Checkout" to `/checkout-step-one.html`, with the cart unchanged. | live look, 2026-10-31 |
| REQ-CART-08 | "Reset App State" in the menu empties the cart. | the application's script |
| REQ-CART-09 | The cart page sends a visitor without a session to `/` (the login's REQ-LOGIN-08). | the application's script |
| REQ-CART-10 | The cart page has no horizontal scroll on any device project. | live look, 1280 px and 412 px, 2026-10-31 |
| REQ-CART-11 | "Remove", "Continue Shopping" and "Checkout" can be reached and used with the keyboard alone. | quality checklist, WCAG 2.1 SC 2.1.1 |

## Acceptance criteria

- **Given** `standard` with an empty cart, **when** they add the Backpack on the list, **then** its
  button reads "Remove", the badge shows 1 and the cart lists the Backpack with quantity 1
  (REQ-CART-01, -03).
- **Given** a cart with two products, **when** one is removed in the cart, **then** the cart lists the
  other one only and the badge shows 1 (REQ-CART-02).
- **Given** a cart with two products, **when** the page is reloaded, **then** both are still in the
  cart (REQ-CART-05).
- **Given** a cart with products, **when** "Reset App State" is chosen in the menu, **then** the
  badge disappears and the cart is empty (REQ-CART-08).

## Roles and entry state

- `standard`: signed in through the `session-username` cookie. A case that starts with products in
  the cart writes them to local storage (`cart-contents`, a JSON array of product ids) before the
  page opens, so only the cases about adding go through "Add to cart" (SD-01c builds the fixture).
- `anonymous`: only for REQ-CART-09.

## Elements

| Element | Notes |
|---|---|
| `button "Cart, empty"` / `button "Cart, <n> items"` | in the banner on every signed-in page; the badge inside shows `<n>` (G1) |
| `button "Add to cart"` / `button "Remove"` | per product on the list and the product page; "Remove" per row in the cart |
| `button "View details for <product>"` | the product's name in a cart row |
| `button "Continue Shopping"`, `button "Checkout"` | below the rows |
| "Your Cart", "QTY", "Description" | plain text, not a heading or a table (G6) |
| `navigation` → `button "Reset App State"` | after "Open Menu" |

## Validations

No field takes text, and the quantity is always 1: the cart has no control to change it, and adding
a product already in it changes nothing.

## States

| State | What the page shows | How a case reaches it |
|---|---|---|
| empty | the labels, "Continue Shopping", "Checkout"; no badge, "Cart, empty" | a fresh `standard` context |
| one product | one row, badge 1, "Cart, 1 items" | "Add to cart" once, or local storage `[<id>]` |
| several products | one row each in the order added | "Add to cart" several times, or local storage |
| unknown product in storage | badge 1, no row | local storage `[999]` (G4) |
| broken storage | a blank page and an uncaught `SyntaxError` | local storage that is not JSON (G5) |
| loading | none: the cart is read from local storage at once | — |

## Navigation

The cart button in the banner opens `/cart.html` from every signed-in page. "Continue Shopping" goes
to the list, "Checkout" to the first checkout step, a product's name to its page. The cart survives
navigation, reload and Logout (G3). The document of `/cart.html` opened directly answers `404`, like
the list (inventory G1).

## Responsive differences

`app.json` declares no breakpoints. At 1280 px and 412 px the cart has the same rows, buttons and
order, and neither width scrolls sideways.

## Network dependencies

None: the cart lives in local storage and the products are built into the script. Every page also
loads Google Fonts and sends to `events.backtrace.io` (login G4).

## Quality dimensions

| Dimension | Applies? | Expected, or why not |
|---|---|---|
| responsive | applies | no horizontal scroll at any project; the same rows at every width |
| perf | n/a | the cart is read from local storage with no loading state |
| security | applies | the cart page refuses a visitor without a session; what Logout leaves in the browser (G3); nothing sensitive in the URL |
| layout | applies | the page health guard on every case; the visual case of a cart with products |
| navigation | applies | Continue Shopping, Checkout, a product's page; the cart kept across pages and reload; Reset App State |
| a11y | applies | axe against the baseline; the cart button's name with 0, 1 and several products; the buttons with the keyboard |
| content | n/a | the texts are fixed in the application; the cart shows no text the user wrote |

## Measurements

| What | Route | Device | Date |
|---|---|---|---|
| Empty: "QTY Description", "Continue Shopping", "Checkout"; no badge; "Cart, empty" | `/cart.html` | desktop Chromium | 2026-10-31 |
| `[4]`: one row (Backpack, quantity 1, $29.99, "Remove"); badge 1; "Cart, 1 items" | `/cart.html` | desktop Chromium | 2026-10-31 |
| `[4,0]`: Backpack then Bike Light; badge 2; "Cart, 2 items"; on the list both read "Remove", the other four "Add to cart"; the Backpack's page reads "Remove" | `/cart.html`, `/inventory.html`, `/inventory-item.html?id=4` | desktop Chromium | 2026-10-31 |
| "Continue Shopping" moved to `/inventory.html`; "Checkout" to `/checkout-step-one.html` | `/cart.html` | desktop Chromium | 2026-10-31 |
| `[4,0]` on a phone: same rows; `scrollWidth` 412 | `/cart.html` | Pixel 7 | 2026-10-31 |
| `[999]`: badge 1, "Cart, 1 items", no row | `/cart.html` | desktop Chromium | 2026-10-31 |
| `not-json`: blank page, "SyntaxError: Unexpected token … is not valid JSON" | `/cart.html` | desktop Chromium | 2026-10-31 |
| The document `/cart.html` answered `404` on every load | `/cart.html` | desktop Chromium, Pixel 7 | 2026-10-31 |

## Gaps and discrepancies

The local tracker has no issue about this application yet; each gap was searched there on
2026-10-31.

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | With one product the cart button is named "Cart, 1 items", so a screen reader says "1 items". | live look, 2026-10-31; the application's script | searched, none |
| G2 | An empty cart says nothing about being empty and still offers "Checkout". | live look, 2026-10-31 | searched, none |
| G3 | Logout keeps the cart in the browser, so whoever signs in next on the same browser finds it (login G5). | the application's script, 2026-10-31 | searched, none; how it is tested is A1 |
| G4 | Local storage naming a product that does not exist makes the badge count it while the cart lists nothing. | live look, 2026-10-31 | searched, none |
| G5 | Local storage that is not JSON leaves every page blank with an uncaught `SyntaxError`; only a changed browser storage reaches it. | live look, 2026-10-31 | searched, none |
| G6 | The cart has no heading, and its rows are not a table: "QTY" and "Description" are plain text, not column headers. | live look, 2026-10-31 | searched, none |

## Out of scope

- The checkout steps after "Checkout": a later intake; this contract checks only that "Checkout"
  leads to the first step.
- `problem_user` and `error_user`: they fail to add or remove some products on purpose; no backlog
  row asks for them in v0.1.
- Quantities above 1: the application has no way to set them.

## Assumptions to confirm

- A1: settled by the owner (2026-10-31). The case states that Logout empties the cart, and runs as a
  known gap once `qa-report-bug` files G3.
- A2: REQ-CART-01, -02 and -08 come from the application's script and from the states prepared in
  local storage; automate watches each one by pressing the buttons in a spec.
- A3: settled by the owner (2026-10-31). G4 and G5 are reached only by changing the browser's
  storage; they stay recorded here, with no case.
