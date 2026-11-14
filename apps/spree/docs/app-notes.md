# Spree Commerce admin: application notes

Facts about the application that its specs rely on and its pages do not show: layout breakpoints,
messages, how sessions work, what is safe to change. Each one says how it was observed.

## Sessions

- **A sign-in gives two things**: an access token in the answer of `POST /api/v3/admin/auth/login`
  (a JWT for the `Authorization` header, valid 5 minutes) and the `spree_admin_refresh_token`
  cookie (`httpOnly`, `SameSite=Lax`, path `/api/v3/admin/auth`, 30 days). The dashboard keeps the
  access token in memory and gets a new one from the cookie on every page load
  (`POST /api/v3/admin/auth/refresh`). Observed through the API and the dashboard's requests,
  2026-11-10.
- **The refresh cookie is single-use.** Each refresh destroys it and sets a new one; a used cookie
  gets `401`. One sign-in therefore opens one browser context, and the pack's provider declares
  `singleUseSessions` so the core signs in again for each context. Observed through the API,
  2026-11-10; Spree's `RefreshToken#rotate!`.
- **A password change revokes every refresh cookie of the account** (`RefreshToken.revoke_all_for`),
  so `npm run spree:up` ends the admin's sessions when it sets a new password. Spree's code.
- **Lockout**: five wrong passwords lock an account for 30 minutes, and the right password is
  refused meanwhile with "Account temporarily locked. Try again later.". `npm run spree:up` clears
  the lockout of the admin; any other account a case locks is its own. Observed with a probe account,
  2026-11-10; Spree configuration.
- **Rate limits** on sign-in, refresh and the API per client IP are raised in `docker/compose.yml`,
  since every worker of a run shares one IP.

## The store and its data

- The dashboard's routes carry the store's id, `/dashboard/store_<id>/...`. The sample data gives
  the same ids on every install (the store, the products, the customers, the orders), observed on
  three installs on 2026-11-10, but cases take the store's route from the page a sign-in lands on.
- The sample data (`spree:load_sample_data`) holds 38 products, 125 variants, the orders `#R1001`
  and `#R1002` of the customer `spree@example.com`, and customers; it is the same on every install.
  The default order of the products list changes as background jobs update products, so no case
  relies on a row's position.
- Staff are invited, not created: a role, an invitation in it, the invitation's acceptance link
  (read by an admin through the API) and its acceptance with a password. No email has to be read.

## Pages

- The dashboard is drawn by its scripts after the page loads; a page's heading can appear a moment
  before its form or its rows. The app map waits until the accessibility tree stops changing.
- A section a role cannot read still opens by its address: its heading and its buttons appear over
  an empty table (contract `docs/features/roles.md`, G1, G2).
- The home dashboard reads its reports with `POST /api/v3/admin/reporting/query`, which the app
  map blocks as a write; its charts are empty in the map.
- Product pages link to `/store_<id>/settings/stock-locations`, without `/dashboard`, which answers
  `404`; pressing the "Shop location" link loads that address and the page stays blank. Seen in the
  admin app map, 2026-11-10; confirmed on desktop Chromium and Pixel 7 and filed as `LOCAL-49`,
  2026-11-14.
- Below 768 px the sidebar is a dialog, "Sidebar", that "Toggle Sidebar" opens; from 768 px up it
  is on the page, with "Settings" in a list of its own below the other sections. Read in the
  dashboard's code (`max-width: 767px`) and on desktop Chromium and Pixel 7, 2026-11-14.
- On narrow screens a section's table scrolls sideways inside a container of its own (409 px on
  Orders at Pixel 7); the page itself does not scroll. Observed 2026-11-14.
- The admin API and the products list order the products differently, so a case matches a row
  against the store's product names rather than one name.
- Removing a member (`DELETE /api/v3/admin/admin_users/<id>`) takes them out of the store, not out
  of Spree: they still sign in and land on "You don't have access to any store". Observed on
  desktop Chromium and Pixel 7, 2026-11-14.
- An email field with a malformed address is stopped by the browser's own `type=email` check
  before the page validates it; the page's "Invalid email address" shows for an empty field only.
  Observed on desktop Chromium and Pixel 7, 2026-11-14.
- A refused section asks for more than its list: Products, opened by the orders reader, is refused
  `products`, `custom_field_definitions`, `markets` and `dashboard/counters` (`403` each), and shows
  no message (`LOCAL-48`); `channels`, `reporting/schema` and `POST reporting/query` are refused too
  when the pages ask for them before the next page loads. Observed on desktop Chromium and Pixel 7,
  2026-11-14.
