---
feature: JOURNEY
title: End-to-end journeys
kind: journey
routes:
  [
    /#/register,
    /#/login,
    /#/search,
    /#/basket,
    /#/address/select,
    /#/address/create,
    /#/delivery-method,
    /#/payment/shop,
    /#/order-summary,
    /#/order-completion/<ORDER_ID>,
    /#/order-history,
  ]
contract: docs/features/journeys.md
actors: [anonymous]
dimensions:
  responsive: "n/a: each feature's registry covers its layouts; the journeys run on every device project as they are"
  perf: "n/a: each feature's registry covers its loading states"
  security: "n/a: each feature's registry covers its sessions and protected routes"
  layout: "n/a: the page health guard runs on every page of a journey; each feature's registry covers its layout"
  navigation: "n/a: each feature's registry covers its controls and deep links"
  a11y: "n/a: each feature's registry covers its pages with axe and the keyboard"
  content: "n/a: each feature's registry covers its texts"
test_data:
  <EMAIL>: the address of an account the account builder makes unique per run
  <PRODUCT>: the most stocked product without a limit per customer, read from the API per worker (orders use stock up; app notes)
  <ORDER_ID>: the id the checkout answers, read from the completion URL
---

# Journey cases

Designed from the journeys contract of 2026-10-26. Two journeys, each proving a hand-over that no
feature's cases cross: from the login to an order, and from a new account to its first session.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-JOURNEY-01 | a customer signs in through the form, searches for <PRODUCT> by its name, adds it, checks out with a new address, One Day Delivery and a new card, places the order and finds it in the order history with the completion page's total | REQ-JOURNEY-01 | use-case | high | @smoke @e2e | all | published | specs/journeys/journeys.spec.ts | |
| TC-JOURNEY-02 | a visitor registers through the form, signs in through the form with the new account, and sees <EMAIL> in the account menu and an empty basket titled with it | REQ-JOURNEY-02 | use-case | high | @smoke @e2e | all | published | specs/journeys/journeys.spec.ts | |

## Notes

- **Steps through the UI, over flows.** Each step goes through the page as a user takes it, over the
  flows automate builds for the features: sign in, search and add, check out (address, delivery,
  card, place), and register. Only the account of TC-JOURNEY-01 is arranged through `api/`, since
  the journey starts signed out. Each hand-over is asserted in a step named after it.
- **The end through the API.** TC-JOURNEY-01 reads the order back from `GET /rest/order-history`:
  the product, the total the completion page showed, and an address and a card that are not null
  (the gap of LOCAL-7 would not pass). TC-JOURNEY-02 reads `GET /rest/user/whoami`.
- **Data.** Both journeys create accounts that stay until the container restarts; TC-JOURNEY-01 adds
  an address, a card and an order to its own. The passwords come from the builder and are typed only
  into the login and registration forms. No journey is destructive.
- **Known defects on the way.** The checkout's step buttons are named apart from their text
  (LOCAL-10); the page objects find them by the names the page has, so the journey passes and the
  defect stays with TC-CHECKOUT-27.
- **Devices.** Both run on every device project; the account menu's two forms are the
  `AccountMenu` component's concern.
