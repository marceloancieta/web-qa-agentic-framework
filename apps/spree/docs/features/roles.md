# Staff roles contract

| | |
|---|---|
| Pack and version | `spree` `6.0.3` |
| Feature code | `ROLES` (case ids `TC-ROLES-NN`) |
| Routes | `/dashboard/<store id>`<br>`/dashboard/<store id>/orders`<br>`/dashboard/<store id>/products`<br>`/dashboard/<store id>/customers`<br>`/dashboard/<store id>/settings/staff`<br>`/dashboard/<store id>/settings/roles` |
| Sources | no story or issue: intake from the application itself (FUT-01). The admin app map (`docs/app-map.admin.json`, 2026-11-10); a throwaway probe spec that created two roles and a staff member in each through the admin API, looked at the dashboard as each and removed them (2026-11-10, desktop Chromium); the permission catalog (`GET /api/v3/admin/permissions`) and Spree's role model read in the container |
| Intake date | 2026-11-10 |

## Purpose

As the store's admin, I give each member of the staff a role with only the permissions their work
needs, so that the dashboard shows them those sections and the store refuses them the rest.

## Business rules

| ID | Rule | Source |
|---|---|---|
| REQ-ROLES-01 | The admin sees every section in the sidebar: Home, Orders, Products, Inventory, Customers, Companies, Sellers, Loyalty, Promotions, Reports and Settings. | admin app map, 2026-11-10 |
| REQ-ROLES-02 | A staff member's sidebar shows only the sections their role can read: a role with `read_orders` alone shows Home and Orders; a role with `read_products` and `write_products` shows Home, Products and Settings. | probe, 2026-11-10 |
| REQ-ROLES-03 | A role that can read a section sees its data: `read_orders` lists the orders (`#R1001`, `#R1002` of the sample data), `read_products` lists the products. | probe, 2026-11-10 |
| REQ-ROLES-04 | A section a role cannot read shows none of its data, even when its address is opened directly: the table stays without rows. | probe (`/products`, `/customers`, `/settings/staff`, `/settings/roles` as the orders role), 2026-11-10 |
| REQ-ROLES-05 | The store refuses the data of a section a role cannot read: the admin API answers `403` for it (orders role: products, customers, staff, roles; catalog role: orders, customers, staff, roles), and `200` for the role's own section. | probe, 2026-11-10 |
| REQ-ROLES-06 | The settings a role sees are limited to its permissions: the catalog role's settings list "Imports" and "Roles" only, and the orders role has no Settings link. | probe, 2026-11-10 |
| REQ-ROLES-07 | Only the admin manages the staff: Staff lists the members with "Invite teammate" and Roles lists the roles with "Add role" for the admin, and the API refuses both lists to a role without the staff permissions (`403`). | admin app map; probe (the API answers to reads), 2026-11-10 |
| REQ-ROLES-08 | A staff member whose account is removed can no longer sign in, and a role still held by a member cannot be removed without removing them first. | Spree's role model (`ensure_can_be_deleted`); not observed (A2) |

## Acceptance criteria

- **Given** a staff member whose role reads only orders, **when** they open the dashboard, **then**
  the sidebar shows Home and Orders, and Orders lists the store's orders (REQ-ROLES-02,
  REQ-ROLES-03).
- **Given** the same member, **when** they open `/dashboard/<store id>/products` directly, **then**
  no product appears, and the products API answers `403` for their session (REQ-ROLES-04,
  REQ-ROLES-05).
- **Given** a staff member whose role reads and writes products, **when** they open the dashboard,
  **then** the sidebar shows Home, Products and Settings, and their settings hold "Imports" and
  "Roles" only (REQ-ROLES-02, REQ-ROLES-06).
- **Given** the admin, **when** they open the dashboard, **then** every section is in the sidebar,
  and Staff and Roles offer "Invite teammate" and "Add role" (REQ-ROLES-01, REQ-ROLES-07).

## Roles and entry state

- `admin`: the existing account (`docs/features/login.md`); it creates the roles and staff of the
  other cases through the API and removes them afterwards.
- Staff of a limited role, made per worker through the admin API: a role with a permission set
  (`POST /api/v3/admin/roles` with `name` and `permissions`), an invitation in that role (`POST
  /api/v3/admin/invitations` with `email` and `role_id`), the invitation's acceptance link (`GET
  /api/v3/admin/invitations/<id>/acceptance_link`, whose `token` the acceptance needs) and the
  acceptance with a generated password (`POST /api/v3/admin/auth/invitations/<id>/accept`). Removal:
  `DELETE /api/v3/admin/admin_users/<id>`, then `DELETE /api/v3/admin/roles/<id>`. No email is sent
  or read.
- The roles the cases need, by permission set: `orders-reader` (`read_orders`) and `catalog-editor`
  (`read_products`, `write_products`). The catalog of permissions is
  `GET /api/v3/admin/permissions`: `read_<scope>` and `write_<scope>` per scope (dashboard, reports,
  orders, payments, fulfillments, refunds, products, product types, publishing, media, and more).

## Elements

| Element | Notes |
|---|---|
| the sidebar | `link "Home"`, `link "Orders"` (with the count of open orders, "Orders 3" for the admin), `link "Products"`, … `link "Settings"`; the links a role cannot read are not there |
| the section heading | `heading "Orders"`, `heading "Products"`, `heading "Customers"`, `heading "Staff"`, `heading "Roles"` (level 1); shown even on a section the role cannot read |
| the data table | `table` with a header row and one `row` per record, each named by its cells (`row "#R1001 1 day ago … $879.99 —"`); empty rows while loading or when refused |
| the write controls | `link "New Order"`, `button "Add product"`, `button "Invite teammate"`, `button "Add role"`, `button "Export"` |
| `button "User menu"` | shows the member's name ("Probe orders-reader" in the probe) |

## Validations

None: the feature changes what the dashboard shows, not a form. Creating a role and inviting a
member are the admin's forms, outside this contract (out of scope).

## States

| State | What the page shows | How a case reaches it |
|---|---|---|
| allowed section | its heading, its table with rows | a role that reads it |
| refused section | its heading, the write controls, the table without rows, no message (G1, G2) | a role without its read permission opening its address |
| sidebar per role | only the readable sections | each role's dashboard |

## Navigation

A member reaches a section from the sidebar, or by its address (a bookmark, a link someone shared).
The sidebar hides what the role cannot read; an address does not (G1). The settings list is reached
from Settings in the sidebar and is filtered the same way (REQ-ROLES-06).

## Responsive differences

The probe ran at 1280 px only. On Pixel 7 the sidebar sits behind `button "Toggle Sidebar"`; whether
it holds the same links per role is not observed yet (A1).

## Network dependencies

| Call | For | A refused role gets |
|---|---|---|
| `GET /api/v3/admin/me` | the member and their permissions | `200` |
| `GET /api/v3/admin/orders`, `/products`, `/customers` | each section's table | `403` without the read permission |
| `GET /api/v3/admin/admin_users`, `/invitations`, `/roles`, `/permissions` | Staff and Roles | `403` without the staff permissions |

## Quality dimensions

| Dimension | Applies? | Expected, or why not |
|---|---|---|
| responsive | applies | the sidebar per role on every device project (A1) |
| perf | n/a: the sections' loading states belong to the sections, not to roles; the refused table looks like a loading one forever (G2), which is a finding, not a timing |
| security | applies | each role sees and receives only its sections, through the UI and the API; a direct address shows no refused data |
| layout | applies | the page health guard on every case; a refused section must not break the page |
| navigation | applies | the sidebar per role; a refused section opened by its address |
| a11y | n/a: the dashboard's accessibility is the same for every role; the axe sweep over the admin map covers it, and the login contract owns the keyboard of the sign-in |
| content | n/a: no text the user wrote is shown back by this feature |

## Measurements

| What | Route | Device | Date |
|---|---|---|---|
| Orders role: sidebar Home, Orders; Orders lists `#R1001`, `#R1002`; `/products`, `/customers`, `/settings/staff`, `/settings/roles` show their headings, write controls and no rows | the routes above | desktop Chromium | 2026-11-10 |
| Catalog role: sidebar Home, Products, Settings; Products lists the products with "Add product"; `/orders` shows "New Order" and no rows; settings list "Imports" and "Roles" | the routes above | desktop Chromium | 2026-11-10 |
| API as the orders role: orders `200`; products, customers, admin_users, roles `403`. As the catalog role: products `200`; orders, customers, admin_users, roles `403` | `/api/v3/admin/*` | API | 2026-11-10 |
| Admin sidebar: Home, Orders 3, Products, Inventory, Customers, Companies, Sellers, Loyalty, Promotions, Reports, Settings | `/dashboard/<store id>` | desktop Chromium | 2026-11-10 |

## Gaps and discrepancies

Each gap was searched in the local tracker on 2026-11-10; none covers them.

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | The write controls are shown whatever the role may write: the orders role (`read_orders` only) sees "New Order" on Orders and "Add product" on Products; the catalog role sees "New Order". What pressing them does is not observed. | probe, 2026-11-10 | searched, none |
| G2 | A section the role cannot read, opened by its address, says nothing: its heading and controls appear over an empty table that looks like a loading one, with no message that access is refused. | probe, 2026-11-10 | searched, none |

## Out of scope

- Creating, changing and removing roles and inviting staff through the admin's forms: those forms
  are the admin's settings, not what a role sees; the cases make roles and staff through the API.
- Every permission of the catalog one by one: the cases sample a reading role and a writing role of
  two sections; the permission list is Spree's own configuration.
- Sellers, companies and the marketplace roles (`role_audience` other than the store).
- Pressing a write control without the permission (G1) until the triage of G1 decides whether it is
  a defect: the case would change data if the server accepted it.

## Assumptions to confirm

- A1: the mobile sidebar behind "Toggle Sidebar" holds the same links per role; automate watches it
  on mobile Chrome.
- A2: REQ-ROLES-08 comes from Spree's model, not from a look: a removed member's sign-in and the
  refusal to remove a held role are watched in automate.
- A3: G1 and G2 go to `qa-report-bug` for triage before design: hiding a control is a usability
  matter while the server refuses the write, and a security one if it accepts it.
