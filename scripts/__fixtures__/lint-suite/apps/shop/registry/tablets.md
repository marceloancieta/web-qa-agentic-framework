---
feature: TABLETS
title: A pairwise set that leaves out the tablet
routes: [/#/]
actors: [anonymous, customer]
pairwise: # expect-finding: pairwise-gap
  - desktop-chromium as anonymous
  - mobile-chrome as customer
  - desktop-firefox as customer
  - desktop-webkit as customer
  - mobile-safari as anonymous
  - desktop-firefox as anonymous
dimensions:
  responsive: 'n/a: the fixture checks the pairwise runs only'
  perf: 'n/a: no loading state'
  security: 'n/a: nothing stored'
  layout: 'n/a: no visual cases'
  navigation: 'n/a: one page'
  a11y: 'n/a: covered elsewhere'
  content: 'n/a: no text rules'
---

# Tablet cases

No run is on a tablet, so WebKit on a tablet and the tablet with either role are not covered.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-TABLETS-01 | the home page opens on every run of the set | | pairwise | medium | @regression | all | draft | | |
