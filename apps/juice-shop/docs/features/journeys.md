# Journeys contract

| | |
|---|---|
| Pack and version | `juice-shop` `20.3.0` |
| Feature code | `JOURNEY` (case ids `TC-JOURNEY-NN`), a journey registry (`kind: journey`) |
| Routes | `/#/register`, `/#/login`, `/#/search`, `/#/basket`, `/#/address/select`, `/#/address/create`, `/#/delivery-method`, `/#/payment/shop`, `/#/order-summary`, `/#/order-completion/<ORDER_ID>`, `/#/order-history` |
| Sources | the approved contracts of the pack: [sign-in](login.md), [sign-up](signup.md), [product search](search.md), [basket](basket.md), [checkout](checkout.md); the checkout walk of 2026-10-26, which went from the search page to the order history through the UI |
| Intake date | 2026-10-26 |

## Purpose

As a shopper, I go from my account to an order I can find again, through every page in between, so
that the shop works as one product and not only page by page.

## Business rules

Each rule is an end-to-end outcome; its Source cites the feature rules it chains, whose details stay
with those features' cases.

| ID | Rule | Source |
|---|---|---|
| REQ-JOURNEY-01 | A customer signs in through the form, searches for a product, adds it to the basket, checks out with a new address, a delivery method and a new card, places the order, and finds it in the order history with the total the completion page showed. | chains REQ-LOGIN-01, REQ-SEARCH-02, REQ-BASKET-03, REQ-BASKET-08, REQ-CHECKOUT-01, REQ-CHECKOUT-04, REQ-CHECKOUT-05, REQ-CHECKOUT-07, REQ-CHECKOUT-08, REQ-CHECKOUT-09, REQ-CHECKOUT-10 |
| REQ-JOURNEY-02 | A visitor registers through the form, signs in through the form with the new account, and finds an empty basket titled with their email. | chains REQ-SIGNUP-06, REQ-LOGIN-01, REQ-BASKET-01, REQ-BASKET-02 |

## Acceptance criteria

- **Given** an account created for the run and the shop's catalogue, **when** the customer signs in,
  searches for a product by its name (the most stocked one, since orders use stock up), adds it,
  adds an address, chooses One Day Delivery, adds a
  card, places the order and opens the order history, **then** the history lists an order with that
  product and the completion page's total, and `GET /rest/order-history` holds it with the address
  and card the journey chose (REQ-JOURNEY-01).
- **Given** no account, **when** a visitor registers with a new email and signs in with it, **then**
  the account menu shows the email and the basket page is "Your Basket (<EMAIL>)", empty
  (REQ-JOURNEY-02).

## Roles and entry state

- REQ-JOURNEY-01: an account created for the case through `api/` (not the worker's shared
  `customer`, since the journey adds an address, a card and an order to it), signed out; its email
  and password from the account builder.
- REQ-JOURNEY-02: `anonymous`, and an email and password from the account builder that no account
  has.

## Elements

The elements of each step are in the feature contracts it chains; a journey adds none.

## Validations

None of its own: a journey enters valid data only. Each form's partitions and boundaries are the
features' cases.

## States

| State | What the journey sees | How it is reached |
|---|---|---|
| signed out | the login form | a fresh context |
| signed in, empty basket | the account menu with the email, the basket button at 0 | the login form |
| basket with one product | the basket button at 1, the product row | the search page's Add to Basket |
| order placed | the completion page, the basket at 0 | the checkout |

## Navigation

Every step is taken as a user would: the login form, the toolbar's search, the product card, the
basket button, Checkout and each step's Continue, the account menu to the order history. No step is
opened by a deep link.

## Responsive differences

None of its own. The journey runs on every device project, so it also proves the purchase on the
mobile and tablet projects; the account menu's place below 960 px is the `AccountMenu` component's concern.

## Network dependencies

The calls of each feature it chains. The end of REQ-JOURNEY-01 is read back through
`GET /rest/order-history`; the end of REQ-JOURNEY-02 through `GET /rest/user/whoami`.

## Quality dimensions

| Dimension | Applies? | Expected, or why not |
|---|---|---|
| responsive | n/a | each feature's registry covers its layouts; the journey runs on every device project as it is |
| perf | n/a | each feature's registry covers its loading states |
| security | n/a | each feature's registry covers its sessions and protected routes |
| layout | n/a | the page health guard runs on every page of the journey; each feature's registry covers its layout |
| navigation | n/a | each feature's registry covers its controls and deep links |
| a11y | n/a | each feature's registry covers its pages with axe and the keyboard |
| content | n/a | each feature's registry covers its texts |

## Measurements

| What | Route | Device | Date |
|---|---|---|---|
| The checkout walk went from the search page to the order history through the UI with one product: four writes, a total of 2.98¤ on the completion page and in the history | the checkout routes | Chromium 1280 and 412 px | 2026-10-26 |

## Gaps and discrepancies

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | The journey goes through the checkout's step buttons, whose accessible names differ from their text; a page object finds them by the names the page has, until the defect is fixed. | checkout contract G5 | LOCAL-10 |

## Out of scope

- A journey through coupons, the wallet or a saved address and card: payment features of their own.
- A journey without a session: the basket and checkout routes open without one today (LOCAL-3), and
  their feature cases cover it.

## Assumptions to confirm

- A1: the sign-in through the form leaves the same session as the `customer` fixture (token and
  basket id), so the basket the journey fills is the one the order empties. The first run records it
  here.
