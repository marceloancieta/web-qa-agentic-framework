# Product list contract

| | |
|---|---|
| Pack and version | `saucedemo` `live` |
| Feature code | `INVENTORY` (case ids `TC-INVENTORY-NN`) |
| Routes | `/inventory.html`, `/inventory-item.html` (the product page) |
| Sources | no story or issue: intake from the application itself (SD-01). The app map (`docs/app-map.standard.json`, 2026-10-31); read-only looks at the live application as `standard` (2026-10-31, desktop Chromium 1280 px and Pixel 7 412 px wide); the application's script read as text (`/assets/index-*.js`, 2026-10-31) |
| Intake date | 2026-10-31 |

## Purpose

As a signed-in shopper, I look through the products, sort them and open one so that I can choose
what to buy.

## Business rules

| ID | Rule | Source |
|---|---|---|
| REQ-INVENTORY-01 | The list, titled "Products", shows 6 products, each with its image, name, description, price and an "Add to cart" button. | live look, 2026-10-31 |
| REQ-INVENTORY-02 | The list opens sorted by "Name (A to Z)". | live look, 2026-10-31 |
| REQ-INVENTORY-03 | "Sort products" orders the list by the option chosen: name A to Z, name Z to A, price low to high, price high to low. | live look of all four options, 2026-10-31 |
| REQ-INVENTORY-04 | The sort chosen is not kept: a reload shows "Name (A to Z)" again, and the URL never holds it. | live look, 2026-10-31 |
| REQ-INVENTORY-05 | A product's image or name opens `/inventory-item.html?id=<n>` with the same image, name, description and price; "Back to products" returns to the list. | live look, 2026-10-31 |
| REQ-INVENTORY-06 | A product page with an unknown or missing `id` shows "ITEM NOT FOUND" instead of a product. | live look, `?id=999` and no `id`, 2026-10-31 |
| REQ-INVENTORY-07 | Both pages send a visitor without a session to `/` (the login's REQ-LOGIN-08). | the application's script; live look of `/inventory.html` without a session, 2026-10-31 |
| REQ-INVENTORY-08 | The list has two columns at 1280 px and one at 412 px, with no horizontal scroll on any device project. | live look, 2026-10-31 |
| REQ-INVENTORY-09 | "Open Menu" shows All Items, Dynamic Catalog, About, Logout and Reset App State; "Close Menu" hides it. | live look, 2026-10-31 |
| REQ-INVENTORY-10 | For `performance_glitch_user` the list still appears, about 5 seconds late, with the same products. | the application's script (a 5-second block each time the list is drawn) |
| REQ-INVENTORY-11 | The sort and every product can be reached and used with the keyboard alone. | quality checklist, WCAG 2.1 SC 2.1.1 |

## Acceptance criteria

- **Given** `standard` signed in, **when** the list opens, **then** it is titled "Products", holds
  6 products and is sorted by name from A to Z (REQ-INVENTORY-01, -02).
- **Given** the list, **when** "Price (low to high)" is chosen, **then** each price is not lower
  than the one before it (REQ-INVENTORY-03).
- **Given** the list sorted by price, **when** the page is reloaded, **then** "Name (A to Z)" is
  selected again (REQ-INVENTORY-04).
- **Given** the list, **when** a product's name is chosen, **then** its page shows the same name,
  description and price, and "Back to products" returns to the list (REQ-INVENTORY-05).

## Roles and entry state

- `standard`: signed in through the `session-username` cookie (`fixtures.ts`), with an empty cart.
- `performance_glitch_user`: an accepted user name that has no actor yet; REQ-INVENTORY-10 needs
  one, read from the environment like the standard one (A2).
- `anonymous`: only for REQ-INVENTORY-07.

## Elements

| Element | Notes |
|---|---|
| `banner`: `button "Open Menu"`, `button "Cart, empty"`, `combobox "Sort products"` | the title "Products" is plain text in the banner, not a heading (G2) |
| `button "View details for <product>"` | twice per product: the image and the name (G5) |
| `button "Add to cart"` | one per product; the cart owns what it does |
| `navigation`: `button "All Items"`, `button "Dynamic Catalog"`, `link "About"`, `button "Logout"`, `button "Reset App State"` | after "Open Menu"; "Close Menu" hides it |
| `button "Back to products"` | on the product page |
| `contentinfo`: `link "X"`, `link "Facebook"`, `link "LinkedIn"` | third-party sites; the walk and the cases do not follow them |

## Validations

No field takes text. "Sort products" is a `select` with four options: `az`, `za`, `lohi`, `hilo`.

## States

| State | What the page shows | How a case reaches it |
|---|---|---|
| list | 6 products, "Name (A to Z)" | `standard` opens `/inventory.html` |
| sorted | the same 6 products in the chosen order | choose an option |
| product | one product with "Back to products" | a product's name or image, or `?id=<n>` |
| not found | "ITEM NOT FOUND", an image of the same name, a price of `$√-1` and "Add to cart" | `?id=999` or no `id` |
| loading | none: the list is drawn at once; for `performance_glitch_user` the page is blocked about 5 seconds first, with no indicator | `performance_glitch_user` |
| empty | unobserved: the products are built into the script, so the list is never empty | — |

## Navigation

Reached after a login, from "All Items" in the menu and from "Back to products". A product's page is
a deep link (`?id=<n>`) that reload keeps. Back from a product page returns to the list, sorted by
name again (REQ-INVENTORY-04). Opening either route directly is answered `404` by the server even
though the page shows (G1).

## Responsive differences

`app.json` declares no breakpoints. The list has two columns at 1280 px and one at 412 px; the
banner, the menu and the product page keep the same elements. Neither width scrolls sideways.

## Network dependencies

No API: the products, their texts and prices are built into the script, and the images are
same-origin files. Every page also loads Google Fonts and sends to `events.backtrace.io` (login
G4). The document of a route opened directly answers `404` (G1).

## Quality dimensions

| Dimension | Applies? | Expected, or why not |
|---|---|---|
| responsive | applies | two columns at 1280 px, one at 412 px; no horizontal scroll at any project |
| perf | applies | `performance_glitch_user` gets the list late; cases wait for the list, never for a time |
| security | applies | both routes refuse a visitor without a session; nothing sensitive in the URL |
| layout | applies | every image loads; the page health guard on every case; the visual case of the list |
| navigation | applies | product page and back; the sort lost on reload and Back; the menu; deep links to a product |
| a11y | applies | axe against the baseline; the sort and the products with the keyboard |
| content | n/a | the texts are fixed in the application and no user text is shown; the not-found page is a state, not content |

## Measurements

| What | Route | Device | Date |
|---|---|---|---|
| 6 products, title "Products", "Name (A to Z)" selected, cart "Cart, empty" | `/inventory.html` | desktop Chromium, Pixel 7 | 2026-10-31 |
| The four sorts: Z to A reverses the names; low to high $7.99 … $49.99; high to low the reverse; the two $15.99 products keep their name order in both price sorts | `/inventory.html` | desktop Chromium | 2026-10-31 |
| After a sort and a reload: "Name (A to Z)"; the URL unchanged | `/inventory.html` | desktop Chromium | 2026-10-31 |
| Product columns: 2 at 1280 px, 1 at 412 px; `scrollWidth` equal to the viewport | `/inventory.html` | desktop Chromium, Pixel 7 | 2026-10-31 |
| All 6 images loaded once the page settled | `/inventory.html` | desktop Chromium, Pixel 7 | 2026-10-31 |
| The document `/inventory.html` answered `404`; the page still showed the list | `/inventory.html` | desktop Chromium | 2026-10-31 |
| "View details for Sauce Labs Backpack" moved to `?id=4`; "Back to products" returned to the list | `/inventory-item.html` | desktop Chromium | 2026-10-31 |
| `?id=999` and no `id`: "ITEM NOT FOUND", price `$√-1`, "Add to cart" | `/inventory-item.html` | desktop Chromium | 2026-10-31 |
| No `h1`–`h6` on the list or the product page | both | desktop Chromium | 2026-10-31 |

## Gaps and discrepancies

The local tracker has no issue about this application yet; each gap was searched there on
2026-10-31.

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | A route opened directly (`/inventory.html`) is answered `404`, while the page shows the list; a monitor or a crawler sees a missing page. The page health guard did not report it in the sign-in smoke. | live look, 2026-10-31 | searched, none |
| G2 | Neither page has a heading: "Products" is plain text in the banner, and a product's name is a button or plain text. | live look, 2026-10-31 | searched, none |
| G3 | The not-found product page shows a price (`$√-1`) and an "Add to cart" button for a product that does not exist. | live look, 2026-10-31 | searched, none |
| G4 | The sort chosen is lost on reload and Back, and the URL does not hold it, so a sorted list cannot be shared or restored. | live look, 2026-10-31 | searched, none; may be by design |
| G5 | Each product has two controls with the same name, "View details for <product>" (its image and its name), so a screen reader announces each product twice. | live look, 2026-10-31 | searched, none |

## Out of scope

- "Add to cart", "Remove" and the cart badge: the cart contract owns them.
- `problem_user` and `error_user`: they show wrong images and broken buttons on purpose; no backlog
  row asks for them in v0.1.
- `visual_user`: the visual lane uses it to prove that a visual difference fails (SD-01c); it is a
  check of the lane, not a rule of the list.
- `/inventory-long.html` and the `dynamic-catalog-*` pages, which "Dynamic Catalog" in the menu
  leads to: left for a later intake (owner's choice, 2026-10-31); `docs/app-notes.md` lists them.
- About, the social links and Reset App State: they leave the application or belong to the cart.

## Assumptions to confirm

- A1: two products with the same price keep their name order in both price sorts; the cases do not
  rely on it and check only that prices never go down (or up).
- A2: REQ-INVENTORY-10 reads `performance_glitch_user` from a new variable,
  `SAUCEDEMO_PERFORMANCE_GLITCH_USER`, with an actor of its own in qa-config, like the lockout case
  of the login (login A2).
- A3: REQ-INVENTORY-10 comes from the application's script; automate watches it in a spec.
