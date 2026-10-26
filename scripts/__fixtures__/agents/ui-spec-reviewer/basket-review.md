---
feature: BREV
title: Basket review fixtures
routes: [/#/basket, /#/search, /#/login]
actors: [anonymous, customer]
dimensions:
  responsive: applies
  perf: 'n/a: the review fixtures hold no loading case'
  security: applies
  layout: 'n/a: the review fixtures hold no visual case'
  navigation: applies
  a11y: 'n/a: the review fixtures hold no accessibility case'
  content: applies
requirements:
  - { id: REQ-BREV-01, text: An empty basket shows its owner, a total of 0 and a disabled Checkout }
  - { id: REQ-BREV-02, text: A product added from the search page is in the basket with quantity 1, and adding it again raises the quantity }
  - { id: REQ-BREV-03, text: The total is the sum of each row's price times its quantity }
  - { id: REQ-BREV-04, text: A product's quantity cannot pass its limit per customer }
  - { id: REQ-BREV-05, text: Only a signed-in customer sees a basket, and only their own }
  - { id: REQ-BREV-06, text: Removing the last product empties the basket, and Checkout follows the contents }
  - { id: REQ-BREV-07, text: The basket page fits every device project, and its title shows the customer's email whole }
test_data:
  <EMAIL>: the address of the customer the case signs in as
---

# Basket review cases

An imaginary feature of the Juice Shop pack for evaluating `ui-spec-reviewer`, built on the blocks
of `review-blocks.ts`. The `customer` account lives for the worker, so every case that touches the
basket starts with `emptyBasketOf(customer)` and puts in what it needs. A case that changes the
basket reads it back through `BasketReviewApi.items()`, since a notification does not prove the
change.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-BREV-01 | an empty basket shows "Your Basket (<EMAIL>)", "Total Price: 0¤" and a disabled Checkout | REQ-BREV-01 | state-transition | high | @sanity @navigation | all | approved | | |
| TC-BREV-02 | adding Apple Juice from the search page says "Placed Apple Juice (1000ml) into basket.", and the basket lists it with quantity 1 | REQ-BREV-02 | use-case | high | @smoke | all | approved | | |
| TC-BREV-03 | adding Apple Juice a second time raises its quantity to 2 | REQ-BREV-02 | state-transition | medium | @regression | all | approved | | |
| TC-BREV-04 | with Apple Juice twice and Orange Juice once, the total is 6.97¤ | REQ-BREV-03 | equivalence-partition | high | @regression | all | approved | | |
| TC-BREV-05 | a sixth Apple Juice says "You can order only up to 5 items of this product." and the quantity stays 5 | REQ-BREV-04 | boundary-value | medium | @regression | all | approved | | |
| TC-BREV-06 | without a session, /#/basket opens the login and shows no basket | REQ-BREV-05 | state-transition | high | @regression @security @known-gap | all | approved | | LOCAL-3 |
| TC-BREV-07 | a second customer who asks for the first one's basket id is refused | REQ-BREV-05 | error-guessing | high | @regression @security @known-gap | all | approved | | LOCAL-1 |
| TC-BREV-08 | removing the last product empties the basket | REQ-BREV-06 | state-transition | medium | @regression | all | approved | | |
| TC-BREV-09 | a basket with a product keeps it after a reload | REQ-BREV-06 | state-transition | medium | @regression @navigation | all | draft | | |
| TC-BREV-10 | a basket with products has no horizontal scroll | REQ-BREV-07 | boundary-value | low | @regression @responsive | all | approved | | |
| TC-BREV-11 | the title shows "Your Basket (<EMAIL>)" whole, with no character clipped | REQ-BREV-07 | use-case | low | @regression @content | all | approved | | |
| TC-BREV-12 | Checkout is enabled once the basket holds a product | REQ-BREV-06 | state-transition | medium | @regression @navigation | all | approved | | |

## Notes

- TC-BREV-04 needs two products in different quantities: with one product of quantity 1 the total
  equals the price, and a page that ignores the quantity would pass.
- TC-BREV-05 reads the limit from the application (5 for Apple Juice) and checks the quantity
  through the API after the refused sixth.
- TC-BREV-07 creates the second account itself and only reads the first one's basket.
- TC-BREV-09 waits for the reviewer's answer on Back before it is approved.
