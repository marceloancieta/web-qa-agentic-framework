---
feature: ROLES
title: Staff roles
routes: [/dashboard/<store id>, /dashboard/<store id>/orders, /dashboard/<store id>/products, /dashboard/<store id>/customers, /dashboard/<store id>/settings, /dashboard/<store id>/settings/staff, /dashboard/<store id>/settings/roles]
contract: docs/features/roles.md
actors: [admin, orders-reader, catalog-editor]
dimensions:
  responsive: applies
  perf: 'n/a: the sections'' loading states belong to the sections, not to roles; the refused table looks like a loading one forever, which is LOCAL-48, not a timing'
  security: applies
  layout: applies
  navigation: applies
  a11y: 'n/a: the dashboard''s accessibility is the same for every role; the axe sweep over the admin map covers it, and the login registry owns the keyboard of the sign-in'
  content: 'n/a: no text the user wrote is shown back by this feature'
test_data:
  <STORE_ID>: the store's id, taken from the page a sign-in lands on
  <PRODUCT>: the name of a product of the sample data, read through the admin API
---

# Staff roles cases

Designed from the contract of 2026-11-10, with its gaps G1 and G2 filed as `LOCAL-47` and
`LOCAL-48` on 2026-11-14. Every rule is cited.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-ROLES-01 | the admin's sidebar holds Home, Orders, Products, Inventory, Customers, Companies, Sellers, Loyalty, Promotions, Reports and Settings | REQ-ROLES-01 | use-case | medium | @regression @navigation | all | published | specs/roles/roles.spec.ts | |
| TC-ROLES-02 | the orders-reader's sidebar holds Home and Orders and no other section, behind "Toggle Sidebar" where the device hides it | REQ-ROLES-02 | equivalence-partition | high | @regression @security @responsive | all | published | specs/roles/roles.spec.ts | |
| TC-ROLES-03 | the catalog-editor's sidebar holds Home, Products and Settings and no other section, behind "Toggle Sidebar" where the device hides it | REQ-ROLES-02 | equivalence-partition | high | @regression @security @responsive | all | published | specs/roles/roles.spec.ts | |
| TC-ROLES-04 | the orders-reader's Orders lists the orders #R1001 and #R1002 of the sample data | REQ-ROLES-03 | use-case | high | @smoke | all | published | specs/roles/roles.spec.ts | |
| TC-ROLES-05 | the catalog-editor's Products lists <PRODUCT> and offers "Add product" | REQ-ROLES-03 | use-case | medium | @regression | all | published | specs/roles/roles.spec.ts | |
| TC-ROLES-06 | a section opened by its address that the role cannot read shows none of its rows once its refused request has answered: the orders-reader on Products, Customers, Staff and Roles; the catalog-editor on Orders and Customers | REQ-ROLES-04 | equivalence-partition | high | @regression @security @navigation | all | published | specs/roles/roles.spec.ts | |
| TC-ROLES-07 | the admin API answers each role by the table `rules/TC-ROLES-07.yaml`: 200 for the sections the role reads, 403 for the rest | REQ-ROLES-05 | decision-table | high | @regression @security | all | published | specs/roles/roles.spec.ts | |
| TC-ROLES-08 | the catalog-editor's settings list holds "Imports" only, and the orders-reader has no Settings link | REQ-ROLES-06 | equivalence-partition | medium | @regression @security | all | published | specs/roles/roles.spec.ts | |
| TC-ROLES-09 | the admin's Staff lists the members with "Invite teammate", and Roles lists the roles with "Add role", the case's roles among them | REQ-ROLES-07 | use-case | medium | @regression | all | published | specs/roles/roles.spec.ts | |
| TC-ROLES-10 | a staff member the admin removed from the store signs in through the form and reaches no store: the page says "You don't have access to any store" and shows no orders | REQ-ROLES-08 | state-transition | high | @regression @security | all | published | specs/roles/roles.spec.ts | |
| TC-ROLES-11 | a role still held by a member cannot be removed, and can be once the member is removed | REQ-ROLES-08 | state-transition | medium | @regression | all | published | specs/roles/roles.spec.ts | |
| TC-ROLES-12 | the orders-reader's dashboard and Orders load with no broken image, failed request, console error or uncaught exception, and a refused section only fails its own refused requests | REQ-ROLES-04 | error-guessing | low | @regression @layout | all | published | specs/roles/roles.spec.ts | |
| TC-ROLES-13 | Orders and a refused section have no horizontal scroll for the orders-reader | REQ-ROLES-03 | boundary-value | low | @regression @responsive | all | published | specs/roles/roles.spec.ts | |
| TC-ROLES-14 | a role without the write permission is offered no write control: the orders-reader sees no "New Order" on Orders, while the catalog-editor sees "Add product" on Products | REQ-ROLES-02 | error-guessing | medium | @regression @navigation @known-gap | all | published | specs/roles/roles.spec.ts | LOCAL-47 |
| TC-ROLES-15 | a section the role cannot read, opened by its address, says that access is refused instead of showing an empty table | REQ-ROLES-04 | error-guessing | medium | @regression @navigation @known-gap | all | published | specs/roles/roles.spec.ts | LOCAL-48 |
| TC-ROLES-16 | the orders-reader's sidebar looks as designed, with Home and Orders only, opened through "Toggle Sidebar" where the device hides it, and the member's name masked | REQ-ROLES-02 | equivalence-partition | low | @regression @visual @layout | all | approved | | |
| TC-ROLES-17 | the catalog-editor's sidebar looks as designed, with Home, Products and Settings only, opened through "Toggle Sidebar" where the device hides it, and the member's name masked | REQ-ROLES-02 | equivalence-partition | low | @regression @visual @layout | all | approved | | |
| TC-ROLES-18 | the page a member removed from the store reaches after signing in looks as designed: "You don't have access to any store" and no store data, with the member's name masked | REQ-ROLES-08 | state-transition | low | @regression @visual @layout | all | approved | | |

## Notes

- **Roles and accounts.** `orders-reader` (`read_orders`) and `catalog-editor` (`read_products`,
  `write_products`) are provisioned actors: the admin makes the role, the invitation and its
  acceptance through the API, once per worker, and removes them at the end (contract, roles and
  entry state). TC-ROLES-10 and TC-ROLES-11 remove a member, so each uses a member and a role of its
  own.
- **TC-ROLES-07** keeps role × section in a decision table: three roles by five sections (orders,
  products, customers, admin users, roles). Every combination is a row, since a `-` row for a role
  would overlap its one allowed section.
- **TC-ROLES-08 and TC-ROLES-10 were revised on 2026-11-14**, with the owner's approval, after
  their first runs: the catalog-editor's settings list "Imports" only (the intake probe also saw
  "Roles"), and a removed member still signs in but reaches no store (REQ-ROLES-06, REQ-ROLES-08).
- **TC-ROLES-12** opens refused sections with the page health guard told to expect their `403`
  answers and nothing else.
- **Responsive.** TC-ROLES-02 and TC-ROLES-03 settle assumption A1: the sidebar's page object opens
  "Toggle Sidebar" on the projects that hide it, and the case asserts the same links on every
  project.
- **Known gaps.** TC-ROLES-14 and TC-ROLES-15 assert what the gaps say should happen and run armed
  with their keys. Neither presses a write control: the store refuses the write (`403`, LOCAL-47).
- **Visual (SP-02, drafted 2026-11-23).** TC-ROLES-16 and TC-ROLES-17 compare the sidebar alone,
  not the whole page: the dashboard beside it holds charts, a date range and counts that change with
  every run. The member's name in the user menu is made per run, so the page object masks it.
  TC-ROLES-18 needs a member of its own, removed before the case signs in, as TC-ROLES-10 does. The
  admin's sidebar and a refused section are left out: the admin's carries counts of the sample data,
  and a refused section shows the empty table of `LOCAL-48`, which a baseline would freeze as
  designed.
- **Not here.** `LOCAL-49` (product pages' "Shop location" links land on a 404) belongs to the
  products feature, which has no contract yet.
- **Out of scope** (contract): the admin's forms for roles and invitations, every permission one by
  one, and the marketplace roles.
- No case is pairwise: each runs on every project of the environment.
