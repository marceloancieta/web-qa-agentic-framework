---
feature: PHONES
title: Pairwise cases without their runs, and a malformed list
routes: [/#/]
dimensions:
  responsive: 'n/a: the fixture checks the pairwise runs only'
  perf: 'n/a: no loading state'
  security: 'n/a: nothing stored'
  layout: 'n/a: no visual cases'
  navigation: 'n/a: one page'
  a11y: 'n/a: covered elsewhere'
  content: 'n/a: no text rules'
---

# Phone cases

The first case is pairwise and the registry lists no runs; the second is a decision of another
technique and needs none.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-PHONES-01 | the menu opens on every phone | | pairwise | medium | @regression | all | draft | | | <!-- expect-finding: pairwise-gap -->
| TC-PHONES-02 | the menu opens on a phone | | equivalence-partition | medium | @regression | all | draft | | |
