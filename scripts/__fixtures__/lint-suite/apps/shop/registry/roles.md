---
feature: ROLES
title: A pairwise set with a role the registry does not have
routes: [/#/]
pairwise: # expect-finding: pairwise-gap
  - desktop-chromium as anonymous
  - desktop-firefox as anonymous
  - desktop-webkit as anonymous
  - tablet as anonymous
  - mobile-chrome as admin
  - mobile-safari as anonymous
dimensions:
  responsive: 'n/a: the fixture checks the pairwise runs only'
  perf: 'n/a: no loading state'
  security: 'n/a: nothing stored'
  layout: 'n/a: no visual cases'
  navigation: 'n/a: one page'
  a11y: 'n/a: covered elsewhere'
  content: 'n/a: no text rules'
---

# Role cases

Without `actors` the only role is anonymous, so `admin` is not one of them, and leaving that run out
leaves Chromium on a phone uncovered.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-ROLES-01 | the home page opens on every run of the set | | pairwise | medium | @regression | all | draft | | |
