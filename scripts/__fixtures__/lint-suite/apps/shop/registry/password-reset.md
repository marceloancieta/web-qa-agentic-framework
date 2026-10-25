---
feature: LOGIN
title: Sign-in recovery
routes: [/#/forgot-password]
dimensions:
  responsive: 'n/a: one column at every width'
  perf: 'n/a: no loading state'
  security: applies
  layout: 'n/a: covered by the visual cases of the shell'
  navigation: 'n/a: one page'
  a11y: 'n/a: covered by the sign-in registry'
  content: 'n/a: no user text is shown back'
---

# Sign-in recovery cases

A feature may span registry files; its ids are numbered across them.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-LOGIN-11 | a reset link works once | | state-transition | medium | @regression @security | all | draft | | |
| TC-LOGIN-03 | reuses an id of the sign-in file | | use-case | low | @regression @security | all | draft | | | <!-- expect-finding: duplicate-case -->
