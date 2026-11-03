---
feature: BASKET
title: Basket
routes: [/basket]
contract: docs/features/basket.md
dimensions:
  responsive: 'n/a: one column at every width'
  perf: 'n/a: no loading state'
  security: 'n/a: no session'
  layout: 'n/a: covered by the visual cases of the shell'
  navigation: 'n/a: one page'
  a11y: 'n/a: covered by the sweep'
  content: applies
---

# Basket cases

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-BASKET-01 | the total adds every product | REQ-BASKET-01 | use-case | high | @regression @content @known-gap | all | automated | specs/basket.spec.ts | BUG-1 |
| TC-BASKET-02 | the empty basket says it is empty | REQ-BASKET-02 | use-case | medium | @regression @content @known-gap | all | automated | specs/basket.spec.ts | BUG-2 | <!-- expect-finding: closed-key -->
| TC-BASKET-03 | the quantity field takes digits only | REQ-BASKET-03 | boundary-value | medium | @regression @content | all | blocked | | BUG-3 |
| TC-BASKET-04 | a removed product leaves the total | REQ-BASKET-01 | use-case | medium | @regression @content @known-gap | all | automated | specs/basket.spec.ts | BUG-9 | <!-- expect-finding: unknown-key -->
| TC-BASKET-05 | the basket keeps its products after a reload | REQ-BASKET-01 | state-transition | low | @regression @content | all | draft | | |

## Notes

- **Known gaps.** -01 (BUG-1) and -02 (BUG-2) arm `knownGap` right before the step that fails. <!-- expect-finding: closed-key -->
- -04 waits on BUG-9 and BUG-2; both claims are stale. <!-- expect-finding: closed-key, unknown-key -->
- BUG-2 and BUG-2 again on one line are one citation. <!-- expect-finding: closed-key -->
- Not citations: `knownGap('BUG-2')` in a code span, XBUG-2, BUG-2b, BUG-2-old and REQ-BUG-2.

```text
BUG-2 in a code block is an example
```

<!-- BUG-9 in a reviewer's note is not a citation -->
