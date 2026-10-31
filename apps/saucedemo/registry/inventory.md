---
feature: INVENTORY
title: Product list
routes: [/inventory.html, /inventory-item.html, /]
contract: docs/features/inventory.md
actors: [anonymous, standard, performance-glitch, visual]
dimensions:
  responsive: applies
  perf: applies
  security: applies
  layout: applies
  navigation: applies
  a11y: applies
  content: 'n/a: the texts are fixed in the application and no user text is shown; the not-found page is a state, covered by TC-INVENTORY-07'
test_data:
  <PRODUCT>: Sauce Labs Backpack, product id 4, one of the six products the application builds in
---

# Product list cases

Designed from the contract of 2026-10-31. Every rule is cited. G1 has a case (TC-INVENTORY-15); G2,
G3, G4 and G5 have none and wait for `qa-report-bug`.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-INVENTORY-01 | the list titled "Products" shows 6 products, each with its image, name, description, price and "Add to cart" | REQ-INVENTORY-01 | use-case | high | @smoke | all | approved | | |
| TC-INVENTORY-02 | every product image on the list loads, and the page asks for no same-origin file that fails | REQ-INVENTORY-01 | error-guessing | medium | @regression @layout | all | approved | | |
| TC-INVENTORY-03 | the list opens with "Name (A to Z)" selected and the names in alphabetical order | REQ-INVENTORY-02 | use-case | medium | @regression | all | approved | | |
| TC-INVENTORY-04 | each option of "Sort products" orders the list by it: names A to Z and Z to A, prices never going down for low to high and never going up for high to low | REQ-INVENTORY-03 | equivalence-partition | high | @regression | all | approved | | |
| TC-INVENTORY-05 | after sorting by price and reloading, "Name (A to Z)" is selected again and the URL holds no sort | REQ-INVENTORY-04 | state-transition | low | @regression @navigation | all | approved | | |
| TC-INVENTORY-06 | <PRODUCT>'s name on the list opens /inventory-item.html?id=4 with the same image, name, description and price, and "Back to products" returns to the list | REQ-INVENTORY-05 | use-case | high | @regression @navigation | all | approved | | |
| TC-INVENTORY-07 | /inventory-item.html with an unknown id and with no id shows "ITEM NOT FOUND" | REQ-INVENTORY-06 | boundary-value | low | @regression | all | approved | | |
| TC-INVENTORY-08 | /inventory-item.html?id=4 opened without a session sends the visitor to / with the message naming the path | REQ-INVENTORY-07 | equivalence-partition | medium | @regression @security | all | approved | | |
| TC-INVENTORY-09 | the list and a product page have no horizontal scroll | REQ-INVENTORY-08 | boundary-value | medium | @regression @responsive | all | approved | | |
| TC-INVENTORY-10 | "Open Menu" shows All Items, Dynamic Catalog, About, Logout and Reset App State, and "Close Menu" hides them | REQ-INVENTORY-09 | state-transition | low | @regression @navigation | all | approved | | |
| TC-INVENTORY-11 | for the performance-glitch actor the list appears late with the same 6 products, and the case waits for the list, never for a time | REQ-INVENTORY-10 | use-case | medium | @regression @perf | all | approved | | |
| TC-INVENTORY-12 | the sort is changed and a product's page opened with the keyboard alone | REQ-INVENTORY-11 | use-case | medium | @regression @a11y | all | approved | | |
| TC-INVENTORY-13 | the list and a product page have no axe violation beyond the baseline | | use-case | medium | @regression @a11y | all | approved | | |
| TC-INVENTORY-14 | the list looks as designed, and the visual actor's list, with its other prices and misplaced cart, does not match it | | use-case | medium | @regression @visual @layout | all | approved | | |
| TC-INVENTORY-15 | /inventory.html opened directly is answered 200, not 404 | | error-guessing | low | @regression @layout | all | approved | | |

## Notes

- **Techniques.** The four sort options are partitions of one control; the price sorts check only
  that prices never go down (or up), since two products share a price and their order is not a rule
  (contract A1). The product page takes one partition per kind of id: a known one (TC-INVENTORY-06),
  an unknown one and none (TC-INVENTORY-07).
- **Data.** Every case uses the `standard` actor with an empty cart, except TC-INVENTORY-08
  (anonymous), -11 (`performance-glitch`) and the second half of -14 (`visual`). Nothing is written;
  no case is destructive.
- **Actors.** `performance-glitch` and `visual` are new: SD-01c adds them to qa-config with
  `SAUCEDEMO_PERFORMANCE_GLITCH_USER` (contract A2) and, the same way, `SAUCEDEMO_VISUAL_USER`.
- **TC-INVENTORY-14** proves the visual lane twice: the standard list matches its baseline, and the
  visual actor's list fails against the same baseline (SD-01 in the backlog). The spec checks that the
  second comparison fails; it is a check of the lane, so it cites no rule.
- **TC-INVENTORY-11** is the anti-flake case: if it passes only with a fixed wait or a longer test
  timeout, the spec is wrong, not the application.
- **TC-INVENTORY-15** checks G1. It fails today; it runs as a known gap once `qa-report-bug` files G1,
  with that key in the Defect column.
- **Without a requirement.** TC-INVENTORY-13, -14 and -15 cover the a11y and layout dimensions; G1
  is a gap of the contract, not one of its rules.
- **Devices.** Every case runs on every device project. The list has two columns on desktop and one
  on a phone; no case asserts a column count, which the visual baselines of each device record.
- **Out of the contract.** "Add to cart" and the cart badge are the cart registry's;
  `problem_user`, `error_user`, `/inventory-long.html` and the `dynamic-catalog-*` pages have no
  cases (contract, Out of scope).
