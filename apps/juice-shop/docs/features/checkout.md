# Checkout contract

| | |
|---|---|
| Pack and version | `juice-shop` `20.3.0` |
| Feature code | `CHECKOUT` (case ids `TC-CHECKOUT-NN`) |
| Routes | `/#/address/select`, `/#/address/create`, `/#/delivery-method`, `/#/payment/shop`, `/#/order-summary`, `/#/order-completion/<ORDER_ID>`, `/#/order-history`, `/#/track-result/new?id=<ORDER_ID>` |
| Sources | no story or issue: intake from the application itself (W8a). The app maps (`docs/app-map.customer.json`, 2026-10-26, with the checkout routes added to `app.json` `app_map.actors.customer`); a throwaway script approved by the owner that created its own accounts and walked the checkout through the UI (2026-10-26, Chromium 1280 and 412 px wide); read-only looks without a session (2026-10-26) |
| Intake date | 2026-10-26 |

## Purpose

As a customer with products in my basket, I choose where they go, how fast and how I pay, place the
order and find it again, so that I get what I bought.

## Business rules

| ID | Rule | Source |
|---|---|---|
| REQ-CHECKOUT-01 | Checkout from a basket with products opens "Select an address", which lists the customer's saved addresses; with none saved it lists none, and its Continue button stays disabled until an address is chosen. | throwaway walk, 2026-10-26 |
| REQ-CHECKOUT-02 | The new address form requires Country, Name, Mobile Number, ZIP Code, Address and City, State being optional; Submit stays disabled until the form is valid, and each empty required field says "Please provide a <field>." once left. | app map constraints; throwaway walk, 2026-10-26 |
| REQ-CHECKOUT-03 | The Mobile Number takes 1000000 to 9999999999 ("Mobile number must match 1000000-9999999999 format."), the ZIP Code at most 8 characters (a counter "<n>/8", invalid beyond), the Address at most 160 characters (`maxlength`). | throwaway walk with 12 and a 20-character ZIP, 2026-10-26; app map |
| REQ-CHECKOUT-04 | A submitted address returns to "Select an address" with "The address at <city> has been successfully added to your addresses." and the address in the list (name, street, city, ZIP, country). | throwaway walk, 2026-10-26 (`POST /api/Addresss/` `201`) |
| REQ-CHECKOUT-05 | The delivery step shows the chosen address and its mobile number, and three methods with price and expected days: One Day Delivery 0.99¤ 1 day, Fast Delivery 0.50¤ 3 days, Standard Delivery 0.00¤ 5 days; Continue stays disabled until one is chosen. | throwaway walk, 2026-10-26 (`GET /api/Deliverys`) |
| REQ-CHECKOUT-06 | The new card form requires Name, a sixteen-digit Card Number ("Please enter a valid sixteen digit card number."), Expiry Month 1 to 12 and Expiry Year 2080 to 2099; Submit stays disabled until it is valid. | throwaway walk with a 3-digit number, 2026-10-26; app map constraints |
| REQ-CHECKOUT-07 | A saved card is listed by its last four digits only ("************<LAST4>", holder, month/year) with "Your card ending with <LAST4> has been saved for your convenience."; Continue stays disabled until a card is chosen. | throwaway walk, 2026-10-26 (`POST /api/Cards/` `201`) |
| REQ-CHECKOUT-08 | The order summary shows the chosen address, the card ending, the basket's products, and Items, Delivery, Promotion and Total Price, the total being their sum. | throwaway walk, 2026-10-26: 1.99¤ + 0.99¤ + 0.00¤ = 2.98¤ |
| REQ-CHECKOUT-09 | Placing the order opens `/#/order-completion/<ORDER_ID>` with "Thank you for your purchase!", the products, the totals, the address and the delivery days of the chosen method, and empties the basket. | throwaway walk, 2026-10-26 (`POST /rest/basket/<bid>/checkout` `200`; the basket button reads 0 and `GET /rest/basket/<bid>` has no products) |
| REQ-CHECKOUT-10 | The placed order is in the customer's order history with its id, total, status "In Transit" and products, and its Track Orders link shows its products and expected delivery. | throwaway walk, 2026-10-26 (`GET /rest/order-history`, `/#/track-result/new?id=<ORDER_ID>`) |
| REQ-CHECKOUT-11 | An order needs an address, a delivery method and a payment: placing one without them is refused. | security and business checklist; the application breaks it (G1, LOCAL-7) |
| REQ-CHECKOUT-12 | Without a session the checkout routes show no checkout and send the visitor to the login. | the owner's decision, 2026-10-26, as for the basket (REQ-BASKET-10); the application breaks it (G2, LOCAL-3) |
| REQ-CHECKOUT-13 | The whole card number never appears again once saved: not in the card list, the summary, the order history, the URL or browser storage. | security checklist; list and summary observed, 2026-10-26 |
| REQ-CHECKOUT-14 | Each step's Back button returns to the step before it, and a reload of a step keeps the choices made before it. | the Back buttons on every step (app map); the behaviour unobserved |
| REQ-CHECKOUT-15 | An order's details are shown only to the customer who placed it: its tracking, through the page and the API, is refused to anyone else and without a session. | the owner's decision, 2026-10-26; the application breaks it (G3, LOCAL-8) |

## Acceptance criteria

- **Given** a customer with one product and no saved address, **when** they add an address, choose
  it, choose One Day Delivery, add a card, choose it and place the order, **then** the completion
  page shows the product and a total of the product's price plus 0.99¤, the basket is empty and the
  order is in their history (REQ-CHECKOUT-01, 04, 05, 07, 08, 09, 10).
- **Given** the new address form, **when** a required field is left empty or the mobile number is
  outside its range, **then** the field says why and Submit stays disabled (REQ-CHECKOUT-02, 03).
- **Given** a customer with a product in the basket, **when** they open `/#/order-summary` directly
  and place the order, **then** it is refused (REQ-CHECKOUT-11; red today, G1).
- **Given** no session, **when** someone opens a checkout route, **then** the login opens instead
  (REQ-CHECKOUT-12; red today, G2).
- **Given** an order placed by one customer, **when** someone without a session asks for its
  tracking by its id, **then** it is refused (REQ-CHECKOUT-15; red today, G3).

## Roles and entry state

- `customer`: signed in through the API (the `customer` fixture). Every case changes the account
  (an address, a card, an order), so each needs **a customer of its own**, not the worker's shared
  one. Products go in through `api/` (`POST /api/BasketItems/`); addresses and cards through `api/`
  (`POST /api/Addresss/`, `POST /api/Cards/`) for every case that is not about their form. Clients
  for both are still to be written in automate.
- `anonymous`: a fresh context.
- Data: addresses and cards from builders with fake values per run; a card number of sixteen
  digits that no issuer uses for real cards.

## Elements

| Route | Element | Notes |
|---|---|---|
| `/#/address/select` | `heading "Select an address"` (1), `button "Add a new address"`, `table` of addresses, `button "Proceed to payment selection"` | each address row has a `radio` with no name; the table's header row is empty; the button shows "Continue" and leads to the delivery step (G5) |
| `/#/address/create` | `heading "Add New Address"` (1), `textbox` "Country", "Name", "ZIP Code", "Address", "City", "State", `spinbutton "Mobile Number"`, `button "Back"`, `button "Submit"` | |
| `/#/delivery-method` | `heading "Delivery Address"` (1), `heading "Choose a delivery speed"` (1), `table` with `columnheader` "Price", "Expected Delivery", `button "Back"`, `button "Proceed to delivery method selection"` | three `radio` with no name (G4); the button shows "Continue" and leads to payment (G5) |
| `/#/payment/shop` | `heading "My Payment Options"` (1), `button "Add new card Add a credit or debit card"` opening a `region` with `textbox "Name"`, `spinbutton "Card Number"`, `combobox` "Expiry Month", "Expiry Year", `button "Submit"`; a `table` of cards; `button "Pay <amount>¤"` (wallet); `button "Proceed to review"` | each card row has a `radio` with no name and the header row has four empty cells; the review button shows "Continue" (G5) |
| `/#/order-summary` | `heading "Your Basket (<EMAIL>)"` (1), a `table` of products, text "Order Summary" with a `table` Items, Delivery, Promotion, Total Price, `button "Complete your purchase"` | the button shows "Place your order and pay" (G5); "Order Summary" is not a heading (G6) |
| `/#/order-completion/<ORDER_ID>` | `heading "Thank you for your purchase!"` (1), `link "Track Orders"`, `link "Tweet"` (twitter.com), `button "Print order confirmation"`, a `table` of products and totals | |
| `/#/order-history` | text "Order History", per order "Order ID #<ORDER_ID>", total, bonus, status, `button "Track Your Order"`, a `table` of products | no heading (G6); empty: `img "No results found"` and "You have not placed any orders yet." |
| `/#/track-result/new?id=<ORDER_ID>` | `heading "Search Results - <ORDER_ID>"` (1), `heading "Expected Delivery"` (3), `heading "Ordered products"` (2), a `table` | |

## Validations

| Field | Constraints | Beyond them |
|---|---|---|
| Country, Name, City | `required` | "Please provide a <field>." once left empty |
| Mobile Number | `type=number`, `required` | "Mobile number must match 1000000-9999999999 format." |
| ZIP Code | `required` | counter "<n>/8"; invalid beyond 8 characters, although the field takes more |
| Address | `required`, `maxlength=160` | |
| State | none | an empty State leaves ", ," in the address line (G7) |
| Card Name | `required` | "Please provide a name." |
| Card Number | `type=number`, `required` | counter "<n>/16"; "Please enter a valid sixteen digit card number." |
| Expiry Month, Expiry Year | `select`, `required` | 1 to 12; 2080 to 2099 |

Boundaries for design: mobile 999999, 1000000, 9999999999, 10000000000; ZIP 8 and 9 characters;
Address 160 and 161; card 15, 16 and 17 digits.

## States

| State | What the page shows | How a case reaches it |
|---|---|---|
| no saved address | the heading, Add New Address, Continue disabled, no table | a customer created for the case |
| one address, none chosen | the row, Continue disabled | an address through `api/` |
| delivery, none chosen | the address, three methods, Continue disabled | an address chosen |
| no saved card | the payment options, Continue disabled | a customer created for the case |
| summary loading | the products table empty and every amount 0.00¤ until the answers arrive (G8) | `delay` on `/rest/basket/<bid>`, which holds the real answer (no `@mocked`) |
| completion loading | `{{bonus}}` shown raw and amounts 0.00¤ until the order arrives (G8) | `delay` on the order's call |
| order placed | REQ-CHECKOUT-09 | the whole flow, or `api/` up to the summary |
| empty history | "You have not placed any orders yet." | a customer created for the case |
| an address save fails | the form empties every field and stays on `/#/address/create`, with no message and no success notification; nothing is listed (TC-CHECKOUT-23 runs, 2026-10-26). What the customer typed is lost without a word: defect LOCAL-15 (G10) | `failWith` (`@mocked`) |
| a card save fails | unobserved | `failWith` (`@mocked`) |
| no session | the route opens: an empty page on the address routes, the delivery and payment forms, "Your Basket (anonymous)" on the summary (G2) | a fresh context |

## Navigation

The basket's Checkout leads to `/#/address/select`; the steps go address, delivery, payment, summary,
completion. Each step from the delivery on has a Back button. A deep link opens any step on its own:
the steps keep their choices in session storage, and a step reached without them asks for
`/api/Addresss/null`, `/api/Deliverys/null` or `/api/Cards/null` and gets `400` (G1). The completion
page links to the tracking page and to twitter.com.

## Responsive differences

At 412 px every step shows the same elements and nothing scrolls sideways. The tracking page hides
the Price column below the toolbar breakpoint. The basket button shows the count alone, as on every
page (`breakpoints.toolbar`).

## Network dependencies

| Call | When |
|---|---|
| `GET /api/Addresss`, `POST /api/Addresss/` | the address list, a new address |
| `GET /api/Addresss/<id>`, `GET /api/Deliverys`, `GET /api/Deliverys/<id>` | the delivery step and the summary |
| `GET /api/Cards`, `POST /api/Cards/`, `GET /api/Cards/<id>`, `GET /rest/wallet/balance` | the payment step and the summary |
| `POST /rest/basket/<bid>/checkout` | placing the order; answers the order id |
| `GET /rest/order-history` | the history; a `500` without a token |
| `GET /rest/track-order/<ORDER_ID>` | the tracking page; answers without a session (G3) |

A failing address, card or checkout call can only be produced with a mock.

## Quality dimensions

| Dimension | Applies? | Expected, or why not |
|---|---|---|
| responsive | applies | no horizontal scroll on any step at any project; the tracking page's columns at 412 px |
| perf | applies | the summary and the completion page do not show zero amounts or raw template text before their answers (G8) |
| security | applies | no order without address, delivery and payment (G1); no checkout without a session (G2); an order's details only to its customer (G3); the card number masked everywhere (REQ-CHECKOUT-13); no card data in the URL or storage |
| layout | applies | the page health guard on every step; product images on the summary; the visual case of the completion page |
| navigation | applies | Continue disabled until a choice; Back on each step; reload keeps the choices; deep links (G1) |
| a11y | applies | axe against the baseline on every step; named radios (G4); names that contain the visible text and name the right step (G5); headings (G6); keyboard through the whole flow |
| content | applies | an address at the 160-character limit and long names in the rows and the summary; an empty State (G7) |

## Measurements

| What | Route | Device | Date |
|---|---|---|---|
| The whole flow with an account the script created: `POST /api/BasketItems/` `200`, `POST /api/Addresss/` `201`, `POST /api/Cards/` `201`, `POST /rest/basket/<bid>/checkout` `200`; no console error, no horizontal scroll on any step. Twice per width. | every checkout route | Chromium 1280 and 412 px | 2026-10-26 |
| One Apple Juice with One Day Delivery: Items 1.99¤, Delivery 0.99¤, Promotion 0.00¤, Total 2.98¤ on the summary, the completion page and in `GET /rest/order-history` (`totalPrice` 2.98, `deliveryPrice` 0.99, `eta` "1") | `/#/order-summary`, `/#/order-completion/<ORDER_ID>` | Chromium 1280 and 412 px | 2026-10-26 |
| A product put in through the API and `/#/order-summary` opened directly: Delivery 0.00¤, Total 1.99¤, the button enabled; placing it opened the completion page, and the history holds an order with `addressId` and `paymentId` null and `eta` "5" | `/#/order-summary` | Chromium 1280 px | 2026-10-26 |
| Without a session: the address routes open with no heading, the delivery and payment steps show their forms, the summary "Your Basket (anonymous)"; no redirect | the checkout routes | Chromium 1280 px | 2026-10-26 |
| `GET /rest/track-order/<ORDER_ID>` without a session answers `200` with the order's products, totals, address and payment ids, and the email with its vowels starred | API | n/a | 2026-10-26 |
| Read early, the summary shows an empty products table and 0.00¤ everywhere, and the completion page `{{bonus}}` and 0.00¤ | `/#/order-summary`, `/#/order-completion/<ORDER_ID>` | Chromium 1280 px | 2026-10-26 |

## Gaps and discrepancies

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | An order is placed without an address, a delivery method or a payment: `/#/order-summary` opened directly places it, with free delivery. | throwaway script, 2026-10-26 | LOCAL-7 (S2) |
| G2 | The checkout routes open without a session instead of sending the visitor to the login; the same family as the basket's LOCAL-3. | read-only look, 2026-10-26 | LOCAL-3, widened by a comment (2026-10-26) |
| G3 | Anyone with an order id reads the order's products and totals through `/rest/track-order/<ORDER_ID>` and the tracking page, without a session. The owner decided it is a defect (2026-10-26); the id is long and random, so S2. | API read, 2026-10-26 | LOCAL-8 (S2) |
| G4 | The radios of the address, delivery and card tables have no accessible name, and their header rows have empty cells. | app map and walk, 2026-10-26 | LOCAL-9 (S2) |
| G5 | The step buttons are named differently from what they show ("Continue", "Place your order and pay"), and two name the wrong step: the address step's "Proceed to payment selection" leads to delivery, the delivery step's "Proceed to delivery method selection" leads to payment. | walk, 2026-10-26 | LOCAL-10 (S2) |
| G6 | "Order Summary" on the summary and "Order History" on the history are plain text, not headings; the history page has no heading at all. | walk, 2026-10-26 | LOCAL-11 (S3) |
| G7 | An address without a State shows ", ," in its line on the list, the delivery step, the summary and the completion page. | walk, 2026-10-26 | LOCAL-12 (S4) |
| G8 | The summary and the completion page show 0.00¤ amounts, an empty table and the raw `{{bonus}}` before their answers arrive; with a paid delivery method the summary's total is the delivery price alone. | early reads in the walk; TC-CHECKOUT-22 runs, 2026-10-26 | LOCAL-13 (S3), the second form in a comment |
| G9 | The new address form refuses mobile numbers from 1000000 to 1111110, which its message and REQ-CHECKOUT-03 allow. | TC-CHECKOUT-06 runs, 2026-10-26 | LOCAL-14 (S3) |
| G10 | A failed address save empties the form without saying it failed. | TC-CHECKOUT-23 runs, 2026-10-26 | LOCAL-15 (S3) |
| G11 | On a phone, the Print icon covers "Track Your Order" in the order history. | a TC-CHECKOUT-14 run and an isolated reproduction, 2026-10-26 | LOCAL-16 (S2) |

## Out of scope

- Coupons, the wallet ("Pay <amount>¤"), "Other payment options" and the deluxe membership: payment
  features of their own.
- Managing saved addresses and cards outside the checkout (`/#/address/saved`,
  `/#/saved-payment-methods`): editing and deleting.
- Printing the confirmation and the Tweet link: they leave the application.
- An order's delivery status after "In Transit": only an administrator changes it.
- Bonus points beyond the line the summary shows.

## Assumptions to confirm

- A1: the steps keep their choices in session storage, so a reload keeps them (REQ-CHECKOUT-14).
  Held in TC-CHECKOUT-20's runs (2026-10-26, both projects): after a reload of the payment step the
  summary showed the chosen address and Fast Delivery's price.
- A2: an address and a card can be created through the API with the customer's token, as the page
  does, so cases that are not about those forms arrange them without the UI.

Settled at the intake gate (2026-10-26): without a session the checkout sends to the login, as the
basket does (G2, LOCAL-3 widened); tracking an order by its id without being its customer is a
defect (G3, LOCAL-8, REQ-CHECKOUT-15). G1 was reproduced with a second account and G3 with a second
order before filing; every gap was filed (LOCAL-7 to LOCAL-13), and the cases that check them run as
known gaps.
