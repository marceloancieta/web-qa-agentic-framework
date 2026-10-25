---
feature: SEARCH
title: Product search
routes: [/#/search]
dimensions:
  responsive: applies
  perf: applies
  security: 'n/a: the search is public and stores nothing'
  layout: 'n/a: covered by the visual cases of the shell'
  navigation: 'n/a: one page'
  a11y: applies
  content: applies
---

# Search cases

Search has its own feature code, so its ids never meet the login ones.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-SEARCH-01 | the list fits a narrow screen | | equivalence-partition | high | @smoke @responsive | all | draft | | |
| TC-SEARCH-02 | a slow answer shows the loading state | | error-guessing | medium | @regression @perf @mocked | all | draft | | |
| TC-SEARCH-03 | the results are announced | | use-case | medium | @regression @a11y | all | draft | | |
| TC-SEARCH-04 | a very long name does not break the card | | boundary-value | low | @regression @content | all | draft | | |
| TC-SEARCH-05 | the filters enable Apply only with a term or a category | | decision-table | medium | @regression | all | draft | | |
| TC-SEARCH-06 | the sort options depend on the result count | | decision-table | low | @regression | all | draft | | |
| TC-SEARCH-07 | the price filter and the stock filter together | | decision-table | low | @regression | all | draft | | |
| TC-SEARCH-08 | the table of this case was never written | | decision-table | low | @regression | all | draft | | | <!-- expect-finding: case-without-table -->
| TC-SEARCH-09 | a table that breaks its format | | decision-table | low | @regression | all | draft | | |
