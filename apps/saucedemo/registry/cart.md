---
feature: CART
title: Cart
routes: [/cart.html, /inventory.html, /inventory-item.html, /checkout-step-one.html, /]
contract: docs/features/cart.md
actors: [anonymous, standard]
dimensions:
  responsive: applies
  perf: 'n/a: the cart is read from local storage with no loading state'
  security: applies
  layout: applies
  navigation: applies
  a11y: applies
  content: 'n/a: the texts are fixed in the application; the cart shows no text the user wrote'
test_data:
  <PRODUCT>: Sauce Labs Backpack, product id 4
  <OTHER_PRODUCT>: Sauce Labs Bike Light, product id 0
---

# Cart cases

Designed from the contract of 2026-10-31. Every rule is cited. G1 and G3 have cases (TC-CART-15,
TC-CART-12); G2 and G6 wait for `qa-report-bug`; G4 and G5 stay recorded with no case (owner,
2026-10-31).

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-CART-01 | "Add to cart" for <OTHER_PRODUCT> on the list turns its button into "Remove", shows 1 on the cart badge, and the cart lists <OTHER_PRODUCT> with quantity 1 | REQ-CART-01 | use-case | high | @smoke | all | published | specs/cart/cart.spec.ts |  |
| TC-CART-02 | "Add to cart" on <PRODUCT>'s page puts it in the cart once: the button turns into "Remove", so the product cannot be added twice | REQ-CART-01 | equivalence-partition | medium | @regression | all | published | specs/cart/cart.spec.ts |  |
| TC-CART-03 | with <PRODUCT> and <OTHER_PRODUCT> in the cart, "Remove" on <PRODUCT> in the cart leaves only <OTHER_PRODUCT> and the badge shows 1 | REQ-CART-02 | state-transition | high | @regression | all | published | specs/cart/cart.spec.ts |  |
| TC-CART-04 | with <PRODUCT> in the cart, "Remove" on the list turns the button back into "Add to cart", the badge disappears and the cart button is named "Cart, empty" | REQ-CART-02 | state-transition | medium | @regression | all | published | specs/cart/cart.spec.ts |  |
| TC-CART-05 | the cart lists <PRODUCT> then <OTHER_PRODUCT> in the order added, each with quantity 1 and the name, description and price the list shows | REQ-CART-03 | use-case | medium | @regression | all | published | specs/cart/cart.spec.ts |  |
| TC-CART-06 | an empty cart shows only the column labels, "Continue Shopping" and "Checkout" | REQ-CART-04 | boundary-value | low | @regression | all | published | specs/cart/cart.spec.ts |  |
| TC-CART-07 | <PRODUCT> and <OTHER_PRODUCT> stay in the cart after a reload, and after a visit to the list and a product page | REQ-CART-05 | state-transition | medium | @regression @navigation | all | published | specs/cart/cart.spec.ts |  |
| TC-CART-08 | <PRODUCT>'s name in the cart opens its product page | REQ-CART-06 | use-case | low | @regression @navigation | all | published | specs/cart/cart.spec.ts |  |
| TC-CART-09 | "Continue Shopping" leads to /inventory.html and "Checkout" to /checkout-step-one.html, with the cart unchanged | REQ-CART-07 | use-case | medium | @regression @navigation | all | published | specs/cart/cart.spec.ts |  |
| TC-CART-10 | "Reset App State" in the menu empties the cart: the badge disappears and the cart lists nothing | REQ-CART-08 | state-transition | medium | @regression @known-gap | all | published | specs/cart/cart.spec.ts | LOCAL-28 |
| TC-CART-11 | /cart.html opened without a session sends the visitor to / with the message naming the path | REQ-CART-09 | equivalence-partition | medium | @regression @security | all | published | specs/cart/cart.spec.ts |  |
| TC-CART-12 | after Logout and a new login, the cart is empty |  | error-guessing | high | @regression @security @known-gap | all | published | specs/cart/cart.spec.ts | LOCAL-29 |
| TC-CART-13 | the cart with two products has no horizontal scroll | REQ-CART-10 | boundary-value | low | @regression @responsive | all | published | specs/cart/cart.spec.ts |  |
| TC-CART-14 | "Remove", "Continue Shopping" and "Checkout" are reached and used with the keyboard alone | REQ-CART-11 | use-case | medium | @regression @a11y | all | published | specs/cart/cart.spec.ts |  |
| TC-CART-15 | the cart button is named "Cart, empty", "Cart, 1 item" and "Cart, 2 items" as the cart holds 0, 1 and 2 products, and the cart page has no axe violation beyond the baseline |  | boundary-value | medium | @regression @a11y @known-gap | all | published | specs/cart/cart.spec.ts | LOCAL-30 |
| TC-CART-16 | the cart with two products looks as designed |  | use-case | low | @regression @visual @layout | all | published | specs/visual/cart.spec.ts |  |

## Notes

- **Techniques.** The cart's size is the boundary: 0, 1 and 2 products (TC-CART-06, -15, -05). Adding
  and removing are transitions between "Add to cart" and "Remove" from the list, a product page and
  the cart.
- **Data.** Only TC-CART-01 and -02 press "Add to cart"; every other case writes its products to local
  storage before the page opens (`cart-contents`), through a fixture SD-01c built. The cart lives in
  the case's own context, so nothing is left behind; no case is destructive.
- **TC-CART-12** states the owner's choice for G3 (contract A1): Logout should empty the cart. It
  fails today and runs as a known gap once `qa-report-bug` files G3, with that key in the Defect
  column and `@known-gap` in its tags.
- **TC-CART-15** checks G1 with one product ("Cart, 1 item"); it fails today and becomes a known
  gap the same way once G1 is filed. The names with 0 and 2 products pass.
- **REQ-CART-01's wording.** The contract writes the name as "Cart, <n> items", which is what the
  page does; TC-CART-15 expects the singular with one product, so it cites no rule and stands on G1.
- **Checkout.** TC-CART-09 stops at the first checkout step; the steps after it wait for a later
  intake (contract, Out of scope).
- **Devices.** Every case runs on every device project; the cart is the same at every width.
