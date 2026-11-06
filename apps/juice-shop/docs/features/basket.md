# Basket contract

| | |
|---|---|
| Pack and version | `juice-shop` `20.3.0` |
| Feature code | `BASKET` (case ids `TC-BASKET-NN`) |
| Routes | `/#/basket`, `/#/search` (where products are added) |
| Sources | no story or issue: intake from the application itself (JS-05). The app maps (`docs/app-map.json` and `docs/app-map.customer.json`, 2026-10-25); read-only looks at the live application as `customer` and without a session (2026-10-25, desktop Chromium 1280 px and 412 px wide); the application's own texts (`/assets/i18n/en.json`) |
| Intake date | 2026-10-25 |

## Purpose

As a customer, I put products into my basket and see what it holds and what it costs, so that I can
check out what I chose.

## Business rules

| ID | Rule | Source |
|---|---|---|
| REQ-BASKET-01 | A signed-in customer's basket page is titled "Your Basket (<EMAIL>)" with the customer's email, and shows the basket the session names. | live look as `customer`, 2026-10-25: `GET /rest/basket/<bid>` with the id from session storage |
| REQ-BASKET-02 | An empty basket shows no product rows, "Total Price: 0¤", a disabled Checkout and "You will gain 0 Bonus Points from this order!". | live look as `customer`, 2026-10-25 |
| REQ-BASKET-03 | Adding a product from the search page puts it in the basket with quantity 1 and says "Placed <product> into basket."; adding it again raises the quantity and says "Added another <product> to basket.". | the application's texts `BASKET_ADD_PRODUCT`, `BASKET_ADD_SAME_PRODUCT`; the behaviour unobserved (a write) |
| REQ-BASKET-04 | The total price is the sum of each row's price times its quantity. | the labels on the page; unobserved with products |
| REQ-BASKET-05 | A product's quantity cannot pass its limit: "You can order only up to <quantity> items of this product."; an exhausted product says "We are out of stock! Sorry for the inconvenience.". | the application's texts; the limits come from `GET /api/Quantitys/` |
| REQ-BASKET-06 | The toolbar's basket button shows how many items the basket holds. | live look: `button "Show the shopping cart"` reads 0 for an empty basket |
| REQ-BASKET-07 | Removing the last product returns the basket to the empty state of REQ-BASKET-02. | unobserved (a write) |
| REQ-BASKET-08 | Checkout is enabled once the basket holds a product. | the disabled button on an empty basket; with products, unobserved |
| REQ-BASKET-09 | A customer sees only their own basket: another customer's basket id is refused, by the API and on the page. | security checklist; the application breaks it (G2, LOCAL-1) |
| REQ-BASKET-10 | Without a session, `/#/basket` shows no basket and sends the visitor to the login. | the owner's decision, 2026-10-25; the application breaks it (G1, LOCAL-3) |
| REQ-BASKET-11 | The basket survives a reload and Back, and the basket button leads to it from any page. | live look as `customer`: the basket comes from the server by the id in session storage, which a reload keeps; reload and Back unobserved with products |

## Acceptance criteria

- **Given** a customer with an empty basket, **when** they add a product from the search page,
  **then** the notification names the product, the basket button shows 1 and the basket page lists
  it with quantity 1 and its price as the total (REQ-BASKET-03, REQ-BASKET-04, REQ-BASKET-06).
- **Given** a basket with one product, **when** the customer removes it, **then** the empty state
  shows and Checkout is disabled (REQ-BASKET-07, REQ-BASKET-02).
- **Given** no session, **when** someone opens `/#/basket`, **then** the login opens instead and no
  basket shows (REQ-BASKET-10; red today, LOCAL-3).
- **Given** two customers, **when** the second asks for the first one's basket id, **then** it is
  refused and the page shows none of the first one's products (REQ-BASKET-09; red today, LOCAL-1).

## Roles and entry state

- `customer`: signed in through the API (the `customer` fixture), with the basket id in session
  storage. A case that needs products puts them in through the UI (the case about adding) or
  through `api/` (every other case; a basket client is still to be written in automate).
- `anonymous`: a fresh context.

## Elements

| Element | Notes |
|---|---|
| `heading "Your Basket (<EMAIL>)"` (level 1) | "Your Basket (anonymous)" without a session |
| `table` | one row per product, named after the product: cells for the image, the name, the quantity, the price, and the row's controls |
| text "Total Price: <amount>¤" | |
| `button "Checkout"` | disabled while the basket is empty |
| text "You will gain <n> Bonus Points from this order!" | |
| `button "Show the shopping cart"` | in the toolbar; "Your Basket <n>" from 960 px, the count alone below |
| `button "Add to Basket"` | on each product card of `/#/search` |

## Validations

No form fields. The quantity limits per product (`GET /api/Quantitys/`) are the boundaries: one below
the limit, the limit, one more.

## States

| State | What the page shows | How a case reaches it |
|---|---|---|
| empty | REQ-BASKET-02 | a customer created for the run |
| with products | a row per product and the total ("Total Price: 1.99¤" for one Apple Juice) | add through the UI, or through `api/` (`POST /api/BasketItems/`) |
| at a product's limit | unobserved | add up to `/api/Quantitys/`'s limit |
| loading | the empty state of REQ-BASKET-02 ("Total Price: 0¤", 0 bonus points) until `/rest/basket/<bid>` answers, with no loading indicator (TC-BASKET-17, 2026-10-26; LOCAL-13) | `delay` on that call, which holds the real answer (no `@mocked`), to see whether the empty state flashes first |
| error | an ordinary empty basket, with no message (TC-BASKET-18, 2026-10-26; LOCAL-17) | `failWith` on `/rest/basket/<bid>` (`@mocked`) |
| anonymous | today "Your Basket (anonymous)", empty, no redirect (LOCAL-3); expected: the login | no session |
| another customer's basket | today that customer's products (LOCAL-1); expected: refused | a second account created by the case, with the first basket's id |

## Navigation

The toolbar's basket button leads to `/#/basket` from every page. Checkout leads on to the address
step, out of scope here. A deep link to `/#/basket` works signed in and shows the anonymous basket
without a session (G1).

## Responsive differences

Below 960 px the toolbar keeps the basket button with the count only, and the account menu moves to
the side navigation. The basket page itself showed the same elements at 1280 and 412 px.

## Network dependencies

`GET /rest/basket/<bid>` (the basket), `GET /rest/user/whoami` (the title), `GET /api/Quantitys/`
(the limits). Adding writes `POST /api/BasketItems/` with the product, the basket id and the
quantity (answered `200`); changing and removing go through the same collection (to confirm in
automate).

## Quality dimensions

| Dimension | Applies? | Expected, or why not |
|---|---|---|
| responsive | applies | no horizontal scroll with products at any project; the table readable at 412 px |
| perf | applies | a slow basket answer: whether the empty state shows before the products (no flash of empty content) |
| security | applies | only the customer's own basket; nothing from a basket without a session; no basket id or email in the URL |
| layout | applies | the page health guard; product images load; the visual case of a basket with products |
| navigation | applies | Checkout disabled while empty; reload and Back keep the basket; the basket button from another page |
| a11y | applies | axe against the baseline; the table's headers; quantity controls reachable by keyboard |
| content | applies | a very long email in the title stays inside the page; long product names in the rows |

## Measurements

| What | Route | Device | Date |
|---|---|---|---|
| As `customer`: title with the email, no rows, "Total Price: 0¤", Checkout disabled, `GET /rest/basket/<bid>` answered `200` | `/#/basket` | desktop Chromium, and 412 px | 2026-10-25 |
| Without a session: "Your Basket (anonymous)", the same empty state, no `/rest/basket` request, no redirect | `/#/basket` | desktop Chromium, and 412 px | 2026-10-25 |
| The toolbar: "Your Basket 0" at 1280 px, "0" at 412 px | `/#/search` | desktop Chromium, and 412 px | 2026-10-25 |
| A throwaway spec with two accounts it created: the first added Apple Juice through `POST /api/BasketItems/` (`200`); the second read `GET /rest/basket/<first id>` (`200`, the first's `UserId` and product) and, with that id in its session storage, saw the row and "Total Price: 1.99¤" on the page. Twice. | `/#/basket` | desktop Chromium | 2026-10-25 |

## Gaps and discrepancies

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | `/#/basket` opens without a session and shows an anonymous basket instead of sending the visitor to the login. The owner decided it should not open (2026-10-25). | live look, 2026-10-25 | LOCAL-3 (S3) |
| G2 | A customer reads another customer's basket by its id, through the API and on the page. Juice Shop is insecure on purpose and this is one of its training vulnerabilities. | throwaway spec, 2026-10-25 | LOCAL-1 (S1) |
| G3 | A failed basket answer is shown as an ordinary empty basket, with no message; the loading state shows the empty state too (LOCAL-13). | TC-BASKET-17 and -18 runs, 2026-10-26 | LOCAL-17 (S3) |
| G4 | The decrease, increase and remove buttons of a basket row have no accessible name; page objects find them by their place in the row. | locator capture in automate, 2026-10-26 | LOCAL-34 (S2) |

## Out of scope

- Checkout, addresses, delivery and payment: a feature of their own.
- Coupons and bonus points beyond the line on an empty basket.

## Assumptions to confirm

- A1: changing a quantity and removing a product go through `/api/BasketItems/` like adding does.
  Half held (TC-BASKET-06, 2026-10-26): an increase reads the item (`GET /api/BasketItems/<id>`),
  saves it (`PUT`) and reloads the basket; the call a removal makes is still unrecorded.
  The first spec run records the calls here.

Settled at the intake gate (2026-10-25): REQ-BASKET-09 was tried with two accounts and fails
(LOCAL-1); without a session the basket must not open (LOCAL-3). Both cases run as known gaps.
