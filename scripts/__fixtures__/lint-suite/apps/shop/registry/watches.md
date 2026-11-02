---
feature: WATCHES
title: A pairwise list that names projects without roles
routes: [/#/]
pairwise: [desktop-chromium, mobile-chrome] # expect-finding: registry-shape
dimensions:
  responsive: 'n/a: the fixture checks the pairwise runs only'
  perf: 'n/a: no loading state'
  security: 'n/a: nothing stored'
  layout: 'n/a: no visual cases'
  navigation: 'n/a: one page'
  a11y: 'n/a: covered elsewhere'
  content: 'n/a: no text rules'
---

# Watch cases

A run is a project with a role; a bare project name is a shape problem, and a malformed list is not
also reported as a gap.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-WATCHES-01 | the home page opens | | pairwise | medium | @regression | all | draft | | |
