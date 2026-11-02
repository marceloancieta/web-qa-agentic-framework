---
feature: BASKET
title: Basket
routes: [/#/basket, /#/search, /#/about, /#/login]
contract: docs/features/basket.md
actors: [anonymous, customer]
dimensions:
  responsive: applies
  perf: applies
  security: applies
  layout: applies
  navigation: applies
  a11y: applies
  content: applies
test_data:
  <EMAIL>: the address of the customer the case signs in as, from the account builder
  <LONG_EMAIL>: a valid address of 120 characters from the account builder
  <PRODUCT>: Apple Juice (1000ml), price 1.99, limit 5 per customer
  <SOLD_OUT>: the product whose stock is 0 in GET /api/Quantitys/ (today OWASP Juice Shop "King of the Hill" Facemask)
  <LOW_STOCK_PRODUCT>: the product without a limit per customer that has the least stock above 0 in GET /api/Quantitys/ (changes with each start)
---

# Basket cases

Designed from the contract of 2026-10-25. Every rule is cited. REQ-BASKET-09 and REQ-BASKET-10 are
broken by the application today, so their cases run as known gaps (LOCAL-1, LOCAL-3).

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-BASKET-01 | a customer's basket page is titled "Your Basket (<EMAIL>)" and shows the basket the session names | REQ-BASKET-01 | use-case | high | @sanity | all | approved | | |
| TC-BASKET-02 | an empty basket shows no rows, "Total Price: 0¤", a disabled Checkout and 0 bonus points | REQ-BASKET-02 | state-transition | medium | @regression @navigation | all | approved | | |
| TC-BASKET-03 | adding <PRODUCT> from the search page says "Placed <PRODUCT> into basket.", the basket button shows 1 and the basket lists it with quantity 1 | REQ-BASKET-03 | use-case | high | @smoke | all | published | specs/basket/basket.spec.ts | |
| TC-BASKET-04 | adding <PRODUCT> a second time says "Added another <PRODUCT> to basket." and its quantity becomes 2 | REQ-BASKET-03 | state-transition | medium | @regression | all | approved | | |
| TC-BASKET-05 | with two products in different quantities, the total is the sum of each price times its quantity | REQ-BASKET-04 | equivalence-partition | high | @regression | all | published | specs/basket/basket.spec.ts | |
| TC-BASKET-06 | <PRODUCT> goes up to 5 in the basket; a sixth says "You can order only up to 5 items of this product." and the quantity stays 5 | REQ-BASKET-05 | boundary-value | medium | @regression | all | published | specs/basket/basket.spec.ts | |
| TC-BASKET-07 | adding <SOLD_OUT> says "We are out of stock! Sorry for the inconvenience." and the basket stays as it was | REQ-BASKET-05 | equivalence-partition | medium | @regression | all | approved | | |
| TC-BASKET-08 | the basket button's count follows the basket: 0 when empty, then the number of items | REQ-BASKET-06 | state-transition | medium | @regression @responsive | all | approved | | |
| TC-BASKET-09 | removing the last product returns the basket to its empty state | REQ-BASKET-07 | state-transition | medium | @regression | all | published | specs/basket/basket.spec.ts | |
| TC-BASKET-10 | Checkout is enabled once the basket holds a product | REQ-BASKET-08 | state-transition | medium | @regression @navigation | all | approved | | |
| TC-BASKET-11 | a second customer who asks for the first one's basket id is refused by the API, and the page shows none of the first one's products | REQ-BASKET-09 | error-guessing | high | @regression @security @known-gap | all | published | specs/basket/basket.spec.ts | LOCAL-1 |
| TC-BASKET-12 | without a session, /#/basket opens the login and shows no basket | REQ-BASKET-10 | state-transition | high | @regression @security @known-gap | all | published | specs/basket/basket.spec.ts | LOCAL-3 |
| TC-BASKET-13 | a basket with a product keeps it after a reload, and after leaving the page and going Back | REQ-BASKET-11 | state-transition | medium | @regression @navigation | all | approved | | |
| TC-BASKET-14 | the basket button opens /#/basket from the search page and from the about page | REQ-BASKET-11 | use-case | low | @regression @navigation | all | approved | | |
| TC-BASKET-15 | neither the basket id nor the email appears in the URL of the basket page | REQ-BASKET-01 | error-guessing | medium | @regression @security | all | approved | | |
| TC-BASKET-16 | a basket with products has no horizontal scroll, and every row shows its name, quantity and price | REQ-BASKET-04 | boundary-value | medium | @regression @responsive | all | approved | | |
| TC-BASKET-17 | a slow basket answer never shows the empty state before the products arrive | REQ-BASKET-01 | error-guessing | medium | @regression @perf @known-gap | all | published | specs/basket/basket.spec.ts | LOCAL-13 |
| TC-BASKET-18 | a failed basket answer is not shown as an empty basket | REQ-BASKET-02 | error-guessing | low | @regression @mocked @known-gap | all | published | specs/basket/basket.spec.ts | LOCAL-17 |
| TC-BASKET-19 | every product image of the basket loads | REQ-BASKET-03 | use-case | low | @regression @layout | all | approved | | |
| TC-BASKET-20 | a basket with products looks as designed | REQ-BASKET-03 | use-case | low | @regression @visual @layout | all | published | specs/visual/basket.spec.ts | |
| TC-BASKET-21 | the basket table names its columns, its quantity controls are reached and used with the keyboard, and the page has no axe violation beyond the baseline | REQ-BASKET-03 | use-case | medium | @regression @a11y | all | approved | | |
| TC-BASKET-22 | the title with <LONG_EMAIL> stays inside the page | REQ-BASKET-01 | boundary-value | low | @regression @content | all | approved | | |
| TC-BASKET-23 | the longest product name of the catalogue stays inside its row | REQ-BASKET-03 | boundary-value | low | @regression @content | all | approved | | |
| TC-BASKET-24 | once the whole stock of <LOW_STOCK_PRODUCT> is ordered, adding it from the search page says "We are out of stock! Sorry for the inconvenience." and the basket stays empty | REQ-BASKET-05 | state-transition | medium | @regression @destructive | all | published | specs/basket/sold-out.spec.ts | |

## Notes

- **Boundaries.** The limits come from `GET /api/Quantitys/` (read on 2026-10-25): Apple Juice has a
  limit of 5 per customer and 81 in stock, so 5 is the boundary and the sixth item the one past it
  (TC-BASKET-06); the Facemask has 0 in stock (TC-BASKET-07). A spec reads the limit from the API
  instead of typing 5, so a change of the catalogue moves the boundary with it.
- **States.** Empty, with products, at a limit, and back to empty (TC-BASKET-02, -03, -06, -09);
  reload and Back with products (-13); without a session (-12).
- **Data and writes.** Every case that changes a basket uses a customer of its own, so no case sees
  another's items; the basket client in `api/` (to be written in automate) puts products in for
  every case except TC-BASKET-03 and -04, which add through the page. TC-BASKET-11 creates two
  accounts. Accounts stay until the next container restart.
- **Destructive.** TC-BASKET-24 orders the whole stock of <LOW_STOCK_PRODUCT> through `api/` with
  an account of its own, then a second account of its own tries to add it from the search page; the
  basket is read back through `api/` and the stock of 0 through `GET /api/Quantitys/`. Until a
  restart the product is sold out for every other case and person, so it is `@destructive`: its own
  spec file, only the destructive lane selects it, and the pack's `recovery` (a container restart,
  which gives the stock back) runs after the lane. TC-BASKET-07 covers a product that starts at 0;
  this case covers the change from in stock to sold out.
- **Results checked through the API.** TC-BASKET-03, -06 and -09 read the basket back through
  `api/` (`GET /rest/basket/<bid>`), not only the notification.
- **Known gaps.** TC-BASKET-11 (LOCAL-1, S1) and TC-BASKET-12 (LOCAL-3, S3) arm `knownGap` right
  before the action and stay red until the defect is fixed.
- **Loading and error.** TC-BASKET-17 holds the real answer with `delay` and lets it through, so it
  is not `@mocked`; TC-BASKET-18 replaces the answer with
  `failWith` and is. What the page shows on an error is unobserved; the first run records it in the
  contract, and a page that shows an ordinary empty basket is a defect to triage.
- **Devices.** Every case runs on every device project of the environment. TC-BASKET-08 checks the
  button in both of its forms ("Your Basket <n>" from 960 px, the count alone below) through the
  page object, which picks the form from the project. No case is pairwise: each runs on every
  project, and the `ci` projects cover every browser and form factor pair (`npm run pairwise`).
