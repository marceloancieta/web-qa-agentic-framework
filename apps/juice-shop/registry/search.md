---
feature: SEARCH
title: Product search
routes: [/#/search, /#/]
contract: docs/features/search.md
actors: [anonymous, customer]
dimensions:
  responsive: applies
  perf: applies
  security: applies
  layout: applies
  navigation: applies
  a11y: applies
  content: applies
test_data:
  <TERM>: apple, a term three products of the catalogue contain
  <NO_MATCH>: a term the builder makes unique per run, which no product name contains
  <MARKUP>: a term with an HTML element in it, such as <b>bold</b>
  <LONG_TERM>: a term of 200 characters without spaces, from the builder
---

# Product search cases

Designed from the contract of 2026-10-25. Every rule is cited. REQ-SEARCH-04 is broken by the
application today, so its case runs as a known gap (LOCAL-2). No case writes: they read the
catalogue the application ships with.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-SEARCH-01 | without a term, the page lists "All Products", 15 cards and "1 – 15 of <total>" | REQ-SEARCH-01 | use-case | high | @sanity | all | automated | specs/search/search.spec.ts | |
| TC-SEARCH-02 | <TERM> keeps exactly the products whose name contains it, under "Search Results - <TERM>" | REQ-SEARCH-02 | equivalence-partition | high | @smoke | all | published | specs/search/search.spec.ts | |
| TC-SEARCH-03 | the term matches whatever its case: apple and APPLE give the same products | REQ-SEARCH-02 | equivalence-partition | medium | @regression | all | automated | specs/search/search.spec.ts | |
| TC-SEARCH-04 | <NO_MATCH> shows "No results found", the hint to adjust the search and "0 of 0" | REQ-SEARCH-03 | equivalence-partition | medium | @regression | all | published | specs/search/search.spec.ts | |
| TC-SEARCH-05 | <MARKUP> shows in the title as the characters typed, and the page creates no element from it | REQ-SEARCH-04 | error-guessing | high | @regression @security @known-gap | all | published | specs/search/search.spec.ts | LOCAL-2 |
| TC-SEARCH-06 | each page size, 15, 30, 45 and 60, shows that many cards and the matching range | REQ-SEARCH-05 | equivalence-partition | medium | @regression | all | automated | specs/search/search.spec.ts | |
| TC-SEARCH-07 | Previous is disabled on the first page and Next on the last; each moves one page and its range | REQ-SEARCH-05 | boundary-value | medium | @regression @navigation | all | published | specs/search/search.spec.ts | |
| TC-SEARCH-08 | the deep link /#/search?q=<TERM> shows its results, and a reload keeps them | REQ-SEARCH-06 | state-transition | medium | @regression @navigation | all | automated | specs/search/search.spec.ts | |
| TC-SEARCH-09 | Back and Forward between two searches show each term's results again | REQ-SEARCH-06 | state-transition | low | @regression @navigation | all | automated | specs/search/search.spec.ts | |
| TC-SEARCH-10 | "Open search" shows the box, and <TERM> sent from it opens /#/search?q=<TERM> with its results | REQ-SEARCH-07 | use-case | high | @regression | all | published | specs/search/search.spec.ts | |
| TC-SEARCH-11 | each card shows the product's image named after the product, its name, its price and "Add to Basket" | REQ-SEARCH-08 | use-case | medium | @regression | all | automated | specs/search/search.spec.ts | |
| TC-SEARCH-12 | every product image of the first page loads | REQ-SEARCH-08 | use-case | low | @regression @layout | all | automated | specs/search/search.spec.ts | |
| TC-SEARCH-13 | the first page of all products looks as designed | REQ-SEARCH-01 | use-case | low | @regression @visual @layout | all | published | specs/visual/search.spec.ts | |
| TC-SEARCH-14 | while a slow answer is pending the page says "Searching for products", and "No results found" never shows before the products | REQ-SEARCH-09 | error-guessing | medium | @regression @perf @known-gap | all | published | specs/search/search.spec.ts | LOCAL-18 |
| TC-SEARCH-15 | a failed product answer is not shown as "No results found" | REQ-SEARCH-03 | error-guessing | low | @regression @mocked | all | published | specs/search/search.spec.ts | |
| TC-SEARCH-16 | an empty catalogue shows "No results found" and "0 of 0" | REQ-SEARCH-03 | error-guessing | low | @regression @mocked @known-gap | all | automated | specs/search/search.spec.ts | LOCAL-43 |
| TC-SEARCH-17 | the search page has no horizontal scroll, and the cards fit the width | REQ-SEARCH-10 | boundary-value | medium | @regression @responsive | all | automated | specs/search/search.spec.ts | |
| TC-SEARCH-18 | <LONG_TERM> stays inside the title | REQ-SEARCH-10 | boundary-value | low | @regression @content @known-gap | all | automated | specs/search/search.spec.ts | LOCAL-42 |
| TC-SEARCH-19 | a term with characters that need escaping in a URL (&, #, %, a space) shows in the title as typed and keeps its results after a reload | REQ-SEARCH-06 | error-guessing | low | @regression @content | all | automated | specs/search/search.spec.ts | |
| TC-SEARCH-20 | the page has no axe violation beyond the baseline, its images are named, and the paginator works with the keyboard | REQ-SEARCH-05 | use-case | medium | @regression @a11y | all | automated | specs/search/search.spec.ts | |
| TC-SEARCH-21 | nothing beyond the term appears in the URL of a search | REQ-SEARCH-06 | error-guessing | low | @regression @security | all | automated | specs/search/search.spec.ts | |
| TC-SEARCH-22 | the title of the list, "All Products" or "Search Results - <TERM>", is a heading a screen reader can reach | REQ-SEARCH-01 | use-case | medium | @regression @a11y @known-gap | all | automated | specs/search/search.spec.ts | LOCAL-5 |
| TC-SEARCH-23 | the toolbar's search box, once open, has an accessible name | REQ-SEARCH-07 | use-case | medium | @regression @a11y @known-gap | all | published | specs/search/search.spec.ts | LOCAL-6 |
| TC-SEARCH-24 | a signed-in customer gets the same products for <TERM> as a visitor | REQ-SEARCH-02 | equivalence-partition | low | @regression | all | automated | specs/search/search.spec.ts | |

## Notes

- **Partitions of the term.** Empty (-01), a match in a few products (-02), another case (-03), no
  match (-04), markup (-05), very long (-18), characters that need escaping (-19). A match in many
  products is the empty term's paging cases (-06, -07): `juice` gives 36 products, but the page
  sizes need the whole catalogue.
- **Boundaries of the paginator.** The first and the last page, with the page size at 15 (-07);
  each page size once (-06). The spec reads the total from the paginator's status rather than
  typing 46.
- **States.** All products, results, no results, loading (-14), error (-15), empty catalogue (-16).
  TC-SEARCH-14 holds the real answer with `delay` and lets it through, so it is not `@mocked`;
  -15 and -16 replace the answer and are.
- **Known gaps.** TC-SEARCH-05 (LOCAL-2, S2), TC-SEARCH-22 (G2, LOCAL-5, S2) and TC-SEARCH-23 (G3,
  LOCAL-6, S2) arm `knownGap` right before the step that fails, and so do TC-SEARCH-16 (G6,
  LOCAL-43, S4) and TC-SEARCH-18 (G5, LOCAL-42, S4), filed from their first runs on 2026-11-08.
  Should axe report the two accessibility gaps, LOCAL-5 and LOCAL-6, in TC-SEARCH-20, their entries
  in `a11y-known.json` cite the same keys, so the axe case fails only on something new.
- **Signed in or not.** The role is a partition of its own: every case runs anonymous, and
  TC-SEARCH-24 checks that a signed-in customer, who lands here after the login, gets the same list.
  One case is enough, since the contract records no difference between the roles. TC-SEARCH-21 runs
  as the customer too (2026-11-08, from the spec review): only a session holds the token, email and
  basket id the URL must not carry, so a visitor's URL would pass even if they leaked.
- **Devices.** Every case runs on every device project of the environment; the contract records no
  difference in behaviour. No case is pairwise: each runs on every project, and the `ci` projects
  cover every browser and form factor pair (`npm run pairwise`).
