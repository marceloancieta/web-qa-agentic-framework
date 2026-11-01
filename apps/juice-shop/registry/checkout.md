---
feature: CHECKOUT
title: Checkout
routes:
  [
    /#/basket,
    /#/address/select,
    /#/address/create,
    /#/delivery-method,
    /#/payment/shop,
    /#/order-summary,
    /#/order-completion/<ORDER_ID>,
    /#/order-history,
    /#/track-result/new,
    /#/login,
  ]
contract: docs/features/checkout.md
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
  <ADDRESS>: a fake address from the address builder, unique per run, with a mobile number inside 1000000-9999999999
  <CITY>: the city of <ADDRESS>
  <LONG_ADDRESS>: an address line of exactly 160 characters from the address builder
  <CARD>: a sixteen-digit card number from the card builder that no issuer uses for real cards
  <LAST4>: the last four digits of <CARD>
  <PRODUCT>: the most stocked product without a limit per customer, read from the API per worker (orders use stock up and a start sets it differently; app notes); Apple Juice (1000ml) at intake
  <SECOND_PRODUCT>: the next most stocked product whose price differs from <PRODUCT>'s, its price read from the API
  <ORDER_ID>: the id the checkout answers, read from the completion URL
---

# Checkout cases

Designed from the contract of 2026-10-26. Every rule is cited. REQ-CHECKOUT-11, -12 and -15 are
broken by the application today, and four accessibility, content and loading gaps were filed at
intake, so their cases run as known gaps (LOCAL-3, LOCAL-7 to LOCAL-13).

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-CHECKOUT-01 | Checkout from a basket with <PRODUCT> opens "Select an address" with no address listed and Continue disabled | REQ-CHECKOUT-01 | state-transition | medium | @regression @navigation | all | published | specs/checkout/address.spec.ts | |
| TC-CHECKOUT-02 | an address added through the form returns to "Select an address", says "The address at <CITY> has been successfully added to your addresses." and lists it, and the API holds it | REQ-CHECKOUT-04 | use-case | high | @regression | all | published | specs/checkout/address.spec.ts | |
| TC-CHECKOUT-03 | the new address form keeps Submit disabled while empty, and each required field left empty says "Please provide a <field>." | REQ-CHECKOUT-02 | equivalence-partition | medium | @regression @navigation | all | approved | | |
| TC-CHECKOUT-04 | an address with every required field and no State is saved | REQ-CHECKOUT-02 | equivalence-partition | low | @regression | all | approved | | |
| TC-CHECKOUT-05 | an address without a State shows no empty slot in its line on the list and the summary | REQ-CHECKOUT-04 | error-guessing | low | @regression @content @known-gap | all | approved | | LOCAL-12 |
| TC-CHECKOUT-06 | a mobile number of 999999 or 10000000000 says "Mobile number must match 1000000-9999999999 format." and keeps Submit disabled; 1000000 and 9999999999 are accepted | REQ-CHECKOUT-03 | boundary-value | medium | @regression @known-gap | all | published | specs/checkout/address.spec.ts | LOCAL-14 |
| TC-CHECKOUT-07 | a ZIP Code of 8 characters is accepted and one of 9 is invalid ("9/8"); <LONG_ADDRESS> is accepted and a 161st character is not taken | REQ-CHECKOUT-03 | boundary-value | low | @regression @content | all | published | specs/checkout/address.spec.ts | |
| TC-CHECKOUT-08 | with one saved address, Continue is enabled only once it is chosen, and leads to the delivery step showing that address and its mobile number | REQ-CHECKOUT-01 | state-transition | medium | @regression @navigation | all | approved | | |
| TC-CHECKOUT-09 | the delivery step lists One Day Delivery 0.99¤ 1 day, Fast Delivery 0.50¤ 3 days and Standard Delivery 0.00¤ 5 days, and Continue stays disabled until one is chosen | REQ-CHECKOUT-05 | equivalence-partition | medium | @regression | all | approved | | |
| TC-CHECKOUT-10 | the new card form keeps Submit disabled until valid; 15 and 17 digits say "Please enter a valid sixteen digit card number.", 16 digits are accepted, and an empty Name says "Please provide a name." | REQ-CHECKOUT-06 | boundary-value | medium | @regression | all | published | specs/checkout/payment.spec.ts | |
| TC-CHECKOUT-11 | a saved card is listed as "************<LAST4>" with its holder and expiry, says "Your card ending with <LAST4> has been saved for your convenience.", the API holds it, and Continue is enabled once it is chosen | REQ-CHECKOUT-07 | use-case | high | @regression @security | all | published | specs/checkout/payment.spec.ts | |
| TC-CHECKOUT-12 | with <PRODUCT> twice and <SECOND_PRODUCT> once and Fast Delivery, the summary shows the chosen address, the card ending in <LAST4>, both rows, and Items, Delivery 0.50¤, Promotion and a Total that is their sum | REQ-CHECKOUT-08 | equivalence-partition | high | @regression | all | published | specs/checkout/order.spec.ts | |
| TC-CHECKOUT-13 | placing the order opens /#/order-completion/<ORDER_ID> with "Thank you for your purchase!", the products, the totals and the delivery days, and empties the basket on the page and in the API | REQ-CHECKOUT-09 | use-case | high | @smoke | all | published | specs/checkout/order.spec.ts | |
| TC-CHECKOUT-14 | the placed order is in the order history with <ORDER_ID>, its total, "In Transit" and its products, and Track Orders shows its products and expected delivery | REQ-CHECKOUT-10 | use-case | medium | @regression | all | published | specs/checkout/order.spec.ts | |
| TC-CHECKOUT-15 | a customer with no orders sees "You have not placed any orders yet." in the order history | REQ-CHECKOUT-10 | state-transition | low | @regression | all | approved | | |
| TC-CHECKOUT-16 | /#/order-summary opened directly, without an address, a delivery method and a card, refuses to place the order and no order is created | REQ-CHECKOUT-11 | error-guessing | high | @regression @security @known-gap | all | published | specs/checkout/order.spec.ts | LOCAL-7 |
| TC-CHECKOUT-17 | without a session, each checkout route opens the login and shows no checkout | REQ-CHECKOUT-12 | state-transition | high | @regression @security @known-gap | all | published | specs/checkout/order.spec.ts | LOCAL-3 |
| TC-CHECKOUT-18 | without a session, the tracking of a customer's order is refused by the API and the tracking page shows none of its products | REQ-CHECKOUT-15 | error-guessing | high | @regression @security @known-gap | all | approved | | LOCAL-8 |
| TC-CHECKOUT-19 | after a card is saved, its whole number appears nowhere: not in the card list, the summary, the order history, the URL or browser storage | REQ-CHECKOUT-13 | error-guessing | high | @regression @security | all | published | specs/checkout/payment.spec.ts | |
| TC-CHECKOUT-20 | Back on the payment and delivery steps returns to the step before, and a reload of the payment step keeps the chosen address and delivery method | REQ-CHECKOUT-14 | state-transition | medium | @regression @navigation | all | published | specs/checkout/payment.spec.ts | |
| TC-CHECKOUT-21 | no checkout step scrolls sideways with <LONG_ADDRESS> and a long holder name, and the summary rows keep name, quantity and price visible | REQ-CHECKOUT-08 | boundary-value | medium | @regression @responsive | all | published | specs/checkout/order.spec.ts | |
| TC-CHECKOUT-22 | a slow basket answer never shows a 0.00¤ total or an empty products table on the summary | REQ-CHECKOUT-08 | error-guessing | medium | @regression @perf @known-gap | all | published | specs/checkout/order.spec.ts | LOCAL-13 |
| TC-CHECKOUT-23 | a failed answer to saving an address is not reported as saved and the list stays empty | REQ-CHECKOUT-04 | error-guessing | low | @regression @mocked | all | published | specs/checkout/address.spec.ts | |
| TC-CHECKOUT-24 | every product image of the summary loads | REQ-CHECKOUT-08 | use-case | low | @regression @layout | all | published | specs/checkout/order.spec.ts | |
| TC-CHECKOUT-25 | the completion page looks as designed | REQ-CHECKOUT-09 | use-case | low | @regression @visual @layout | all | published | specs/visual/checkout.spec.ts | |
| TC-CHECKOUT-26 | the radios of the address, delivery and card tables are named after their rows | REQ-CHECKOUT-05 | use-case | medium | @regression @a11y @known-gap | all | approved | | LOCAL-9 |
| TC-CHECKOUT-27 | each step button's accessible name contains the text it shows and names the step it leads to | REQ-CHECKOUT-01 | use-case | medium | @regression @a11y @known-gap | all | published | specs/checkout/order.spec.ts | LOCAL-10 |
| TC-CHECKOUT-28 | the summary and the order history each have a heading for their content | REQ-CHECKOUT-10 | use-case | low | @regression @a11y @known-gap | all | approved | | LOCAL-11 |
| TC-CHECKOUT-29 | the checkout is completed with the keyboard alone, the focus visible at each control, and no step has an axe violation beyond the baseline | REQ-CHECKOUT-09 | use-case | medium | @regression @a11y | all | approved | | |
| TC-CHECKOUT-30 | a slow order answer never shows raw template text or a 0.00¤ total on the completion page | REQ-CHECKOUT-09 | error-guessing | medium | @regression @perf @known-gap | all | published | specs/checkout/order.spec.ts | LOCAL-13 |

Changed at the automate gate (2026-10-26): TC-CHECKOUT-22 covered the summary and the completion page
under one known-gap arm, so a failure on the way to the completion page read as the gap. The
completion page moved to TC-CHECKOUT-30, approved by the owner, each case with its own arm.

Changed at the automate gate (2026-10-29): TC-CHECKOUT-25 said the order id and the date were masked,
but the completion page shows neither (the id is only in the Track Orders link's address), so the
title no longer names a mask, approved by the owner.

## Notes

- **Techniques.** Partitions of the address form (all required, State left out, each required field
  empty: TC-CHECKOUT-03, -04) and of the delivery methods (-09). Boundaries of the mobile number,
  the ZIP Code, the address line and the card number (-06, -07, -10): one below, at and one past
  each limit the contract measured. State transitions through the steps (-01, -08, -20), the empty
  history (-15) and the session (-17).
- **Coincidence.** The summary case (-12) uses two products, one of them twice, and Fast Delivery,
  so a total that ignored the quantity, a product or the delivery price would differ from the right
  one. The completion case (-13) checks the basket empty through the API, not the button alone.
- **Data and writes.** Every case that writes uses a customer of its own: the addresses, cards and
  orders it adds stay until the container restarts. Cases that are not about a form arrange through
  `api/`: products (`POST /api/BasketItems/`), addresses (`POST /api/Addresss/`) and cards
  (`POST /api/Cards/`), clients still to be written (contract A2). Builders make the address and the
  card unique per run; the card number is fake. No case is destructive.
- **Results checked through the API.** -02, -11, -13, -14 and -16 read the address, the card, the
  basket or the order history back through `api/`.
- **Known gaps.** -16 (LOCAL-7), -17 (LOCAL-3), -18 (LOCAL-8), -05 (LOCAL-12), -22 (LOCAL-13), -26
  (LOCAL-9), -27 (LOCAL-10) and -28 (LOCAL-11) arm `knownGap` right before the action that fails.
  The axe scan of -29 meets LOCAL-9 and LOCAL-11; their violations go to `a11y-known.json` with
  those keys and an expiry, so -29 checks everything else.
- **Loading and error.** -22 holds the real basket answer with `delay` and lets it through, so it is
  not `@mocked`; -23 replaces the address answer with `failWith` and is, and REQ-CHECKOUT-04 is also
  covered by -02 without a mock. What the page shows on that error is unobserved; the first run
  records it in the contract.
- **Devices.** Every case runs on every device project. The tracking page hides the Price column
  below the toolbar breakpoint; -14 checks the columns that every project shows.
- **The journey.** The purchase from the login form to the order history is TC-JOURNEY-01 in the
  journey registry; these cases keep the details of each step.
