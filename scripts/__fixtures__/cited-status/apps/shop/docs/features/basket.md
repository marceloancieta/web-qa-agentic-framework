# Feature contract: Basket

## Business rules

| ID | Rule | Source |
|---|---|---|
| REQ-BASKET-01 | The total is the sum of every product line. | the story; the application breaks it (G1, BUG-1) |
| REQ-BASKET-02 | An empty basket says so. | the story; red today (G2, BUG-2) | <!-- expect-finding: closed-key -->
| REQ-BASKET-03 | The quantity field takes digits only. | the story; until BUG-3 is fixed, the case is blocked |

## Gaps and discrepancies

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | The total ignores the second product. | live look | BUG-1 (S2) |
| G2 | The empty basket shows no message. | live look | BUG-2 (S3) | <!-- expect-finding: closed-key -->
| G3 | A product image is missing at a narrow width. | live look | searched, none |
| G4 | The page title is not a heading. | live look | BUG-9 (S3) | <!-- expect-finding: unknown-key -->

## Workarounds

The page object finds the remove button by its icon until BUG-2 is fixed. <!-- expect-finding: closed-key -->
