---
feature: DEVICES
title: The shop across devices, a complete pairwise set
routes: [/#/]
actors: [anonymous, customer]
pairwise:
  - desktop-chromium as anonymous
  - mobile-chrome as customer
  - desktop-firefox as customer
  - tablet-landscape as anonymous
  - desktop-webkit as customer
  - mobile-safari as anonymous
  - desktop-firefox as anonymous
  - tablet-landscape as customer
dimensions:
  responsive: 'n/a: the fixture checks the pairwise runs only'
  perf: 'n/a: no loading state'
  security: 'n/a: nothing stored'
  layout: 'n/a: no visual cases'
  navigation: 'n/a: one page'
  a11y: 'n/a: covered elsewhere'
  content: 'n/a: no text rules'
---

# Device cases

A look-alike: the landscape tablet stands for the tablet, since both are WebKit tablets, so every
pair of browser, form factor and role is covered.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-DEVICES-01 | the home page opens on every run of the set | | pairwise | medium | @regression | all | draft | | |
