---
feature: JOURNEY
title: End-to-end journeys
kind: journey
routes: [/#/login, /#/basket]
contract: docs/features/journeys.md
actors: [customer]
dimensions:
  responsive: 'n/a: each feature registry covers its layouts'
  perf: 'n/a: each feature registry covers its loading states'
  security: 'n/a: each feature registry covers its sessions'
  layout: 'n/a: each feature registry covers its pages'
  navigation: 'n/a: each feature registry covers its controls'
  a11y: 'n/a: each feature registry covers its pages'
  content: 'n/a: each feature registry covers its texts'
---

# Journey cases

A journey's cases cross features, so each carries @e2e beside its layer tag.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-JOURNEY-01 | a customer signs in and finds the product in the basket | REQ-JOURNEY-01 | use-case | high | @smoke @e2e | all | draft | | |
| TC-JOURNEY-02 | a customer signs in and leaves | REQ-JOURNEY-02 | use-case | high | @smoke | all | draft | | | <!-- expect-finding: journey-tag -->
| TC-JOURNEY-03 | a customer reads the basket after a reload | REQ-JOURNEY-05 | use-case | medium | @regression @e2e @navigation | all | draft | | |
