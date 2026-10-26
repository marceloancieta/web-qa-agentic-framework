# Product search contract

| | |
|---|---|
| Pack and version | `juice-shop` `20.3.0` |
| Feature code | `SEARCH` (case ids `TC-SEARCH-NN`) |
| Routes | `/#/search`, `/#/` (the same product list) |
| Sources | no story or issue: intake from the application itself (JS-05). The app map (`docs/app-map.json`, 2026-10-25); read-only looks at the live application (2026-10-25, desktop Chromium 1280 px and 412 px wide), with the term in the URL; the application's own texts (`/assets/i18n/en.json`) |
| Intake date | 2026-10-25 |

## Purpose

As a visitor or a customer, I look for products by name so that I find what I want to buy.

## Business rules

| ID | Rule | Source |
|---|---|---|
| REQ-SEARCH-01 | Without a term, the page lists every product under "All Products", 15 to a page, with "1 – 15 of <total>". | live look, 2026-10-25: 46 products |
| REQ-SEARCH-02 | A term keeps the products whose name contains it, whatever the case, under "Search Results - <term>". | live look, 2026-10-25: `apple` and `APPLE` both give the same 3 products |
| REQ-SEARCH-03 | A term no product matches shows "No results found" and "Try adjusting your search to find what you're looking for.", with "0 of 0". | live look, 2026-10-25 |
| REQ-SEARCH-04 | The term is shown back as text, never as markup. | security checklist; the application breaks it (G1, LOCAL-2) |
| REQ-SEARCH-05 | The page size is 15, 30, 45 or 60, and Previous and Next move a page at a time, disabled at the ends. | live look, 2026-10-25 |
| REQ-SEARCH-06 | A search is a deep link: opening `/#/search?q=<term>` shows its results, and a reload keeps them. | live look, 2026-10-25: the deep link; a reload opens the same URL, unobserved |
| REQ-SEARCH-07 | The toolbar's "Open search" shows a search box, and a term sent from it opens `/#/search?q=<term>`. | the toolbar on the live page; sending a term unobserved (assumption A1) |
| REQ-SEARCH-08 | Each product card shows the product's image with its name as the alternative text, its name, its price and an "Add to Basket" button. | live look, 2026-10-25 |
| REQ-SEARCH-09 | While the products load, the page says "Searching for products". | the application's text `SEARCH_PROCESSING`; unobserved locally (the answer is fast) |
| REQ-SEARCH-10 | The page has no horizontal scroll on any device project, and a very long term stays inside the title. | quality checklist; 0 px of overflow measured at 1280 and 412 px |

## Acceptance criteria

- **Given** the search page, **when** someone opens `/#/search?q=apple`, **then** exactly the
  products with "apple" in their name show, under "Search Results - apple" (REQ-SEARCH-02,
  REQ-SEARCH-06).
- **Given** a term no product has, **then** "No results found" shows with "0 of 0" (REQ-SEARCH-03).
- **Given** a term with markup, such as `<b>bold</b>`, **then** the title shows the characters as
  typed, and no element is created from them (REQ-SEARCH-04).

## Roles and entry state

`anonymous` and `customer` see the same list; the customer is signed in through the API. No data is
created: the cases read the catalogue the application ships with.

## Elements

| Element | Notes |
|---|---|
| text "All Products" / "Search Results - <term>" | the page title is plain text, not a heading (G2) |
| `article` per product | `button "Click for more information about the product"` around `img "<name>"` and the name; the price; `button "Add to Basket"` |
| text "No results found" | with "Try adjusting your search to find what you're looking for." |
| `group` (the paginator) | `combobox "Items per page:"`, `status` "1 – 15 of 46", `button "Previous page"`, `button "Next page"` |
| `button "Open search"`, `button "Close search"`, a `textbox` | in the toolbar; the textbox has no accessible name (G3) |

## Validations

No form constraints: the toolbar's search box has none in the app map. The term's partitions for
design: empty, a match in one product, a match in many, no match, another case, markup, a very long
term. The page sizes are the paginator's options.

## States

| State | What the page shows | How a case reaches it |
|---|---|---|
| all products | REQ-SEARCH-01 | `/#/search` or `/#/` |
| results | REQ-SEARCH-02 | `/#/search?q=<term>` |
| no results | REQ-SEARCH-03 | a term no product has |
| loading | "All Products", an empty grid and "0 of 0", never "Searching for products" (TC-SEARCH-14, 2026-10-26; LOCAL-18, against REQ-SEARCH-09) | `delay` on `/rest/products/search`, which holds the real answer (no `@mocked`) |
| error | "All Products", no cards and no "No results found": the same picture as loading, with no message (TC-SEARCH-15, 2026-10-26) | `failWith` on `/rest/products/search` (`@mocked`) |
| empty catalogue | unobserved | `mockJson` with no products (`@mocked`) |

## Navigation

The list is the landing page (`/#/`) and where a login lands. A term lives in the URL, so Back,
Forward and reload keep it. Next page does not change the URL, so a reload returns to the first page.

## Responsive differences

At 412 px the same cards and paginator show, and the toolbar keeps the search button; how many
columns the cards take at each width was not measured. No difference in behaviour was seen.

## Network dependencies

`GET /rest/products/search?q=` asks for the whole catalogue whatever the term, and the page filters
it (measured: the request never carried the term). `GET /api/Quantitys/` for the stock. `delay` on the
first call produces the loading state with the real answer; a mock of it, the error and empty states.

## Quality dimensions

| Dimension | Applies? | Expected, or why not |
|---|---|---|
| responsive | applies | no horizontal scroll at any project; the cards fit the width at each project |
| perf | applies | "Searching for products" while a slow answer is pending, and no flash of "No results found" before the products |
| security | applies | the term shown as text (G1); nothing beyond the term in the URL |
| layout | applies | product images load (the page health guard); the visual case of the first page |
| navigation | applies | the paginator's disabled ends; Back, Forward and reload keep the term; the deep link |
| a11y | applies | axe against the baseline; images named; the paginator by keyboard; the title as a heading (G2) |
| content | applies | a very long term in the title; a term with characters that need escaping |

## Measurements

| What | Route | Device | Date |
|---|---|---|---|
| 46 products, "1 – 15 of 46", page sizes 15, 30, 45 and 60; Next shows "16 – 30 of 46" with the URL unchanged | `/#/search` | desktop Chromium | 2026-10-25 |
| `apple` and `APPLE`: 3 products each; `juice`: "1 – 15 of 36" | `/#/search?q=…` | desktop Chromium | 2026-10-25 |
| `zzzqqq`: "No results found", "0 of 0" | `/#/search?q=zzzqqq` | desktop Chromium | 2026-10-25 |
| `<b>bold</b>`: the title read "Search Results - bold" and held a `<b>` element | `/#/search?q=%3Cb%3Ebold%3C%2Fb%3E` | desktop Chromium | 2026-10-25 |
| every term: `GET /rest/products/search?q=` with an empty `q` | `/#/search` | desktop Chromium | 2026-10-25 |
| 0 px of horizontal overflow | `/#/search` | 1280 and 412 px | 2026-10-25 |

## Gaps and discrepancies

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | Markup in the term becomes markup in the page: the title of `<b>bold</b>` holds a `<b>` element. Juice Shop is insecure on purpose and this is one of its training vulnerabilities (injection through the search). | live look, 2026-10-25 | LOCAL-2 (S2) |
| G2 | "All Products" and "Search Results - <term>" are plain text, not headings, so the page has no heading a screen reader can jump to. | live look, 2026-10-25 | LOCAL-5 (S2) |
| G3 | The toolbar's search box has no accessible name; it is found through "Open search". | app map and live look, 2026-10-25 | LOCAL-6 (S2) |
| G4 | While the catalogue loads the page never says "Searching for products": it shows "All Products", an empty grid and "0 of 0", like an empty shop. | TC-SEARCH-14 runs, 2026-10-26 | LOCAL-18 (S3) |

## Out of scope

- The product details dialog (`Click for more information about the product`): reviews and the
  details belong to a feature of their own.
- What "Add to Basket" does: the basket contract (REQ-BASKET-03).
- Searching through the API: the cases check what the page shows.

## Assumptions to confirm

- A1: a term sent from the toolbar's box opens `/#/search?q=<term>` (REQ-SEARCH-07). Design does
  not type into the box. Held in TC-SEARCH-10 (2026-10-26, both projects): a term sent from the open box
  opens `/#/search?q=<term>` with exactly its products.

Settled at the intake gate (2026-10-25): G1 is filed as LOCAL-2, so the case of REQ-SEARCH-04 runs
as a known gap with that key.
