# Swag Labs: application notes

Facts about the application that its specs rely on and its pages do not show: layout breakpoints,
messages, how sessions work, what is safe to change. Each one says where it shows, how it was
observed and its status: `by design` (the application means it), `defect` (with its key) or `open`
(not yet known which). The routes are paths after `<base_url>`.

| Fact | Where | Observed | Status |
|---|---|---|---|
| The login runs in the browser: the user names it accepts and the password are built into its script, and no request reaches a server. A successful login writes a `session-username` cookie (path `/`, 10 minutes) holding the user name; the pack's actors are signed in by building that cookie, which here lasts for the browser session. | `/` | the application's script, read as text, 2026-10-31 | by design |
| A session counts when the cookie names an accepted user other than `locked_out_user`. | every route | the application's script, read as text, 2026-10-31 | by design |
| A protected page opened without a session sends the visitor back to `/`, which shows "You can only access '<path>' when you are logged in." | every route but `/` | the application's script, read as text, 2026-10-31 | by design |
| The cart lives in local storage under `cart-contents`, as a JSON array of product ids. | every route | the application's script, read as text, 2026-10-31 | by design |
| Every page load sends to `events.backtrace.io`, an error-reporting service, and a refused login sends it the user name typed (login G4). | every route | live look (hosts asked) and the application's script, 2026-10-31 | open |
| The server answers `404` to the document of a route opened directly, such as `/inventory.html`, and the page still shows (inventory G1). | `/inventory.html`, `/cart.html`; other routes not yet checked | live looks, `/inventory.html` and `/cart.html`, 2026-10-31 | open |
| The sort of the product list lives only in the page: a reload or Back shows "Name (A to Z)" again. | `/inventory.html` | live look, 2026-10-31 | open (inventory G4) |
| `performance_glitch_user` blocks the page for 5 seconds each time the product list is drawn. | `/inventory.html` | the application's script, read as text, 2026-10-31 | by design |
| Besides the shop's pages (`inventory.html`, `inventory-item.html`, `cart.html`, `checkout-step-one.html`, `checkout-step-two.html`, `checkout-complete.html`), the script routes `inventory-long.html` and three `dynamic-catalog-*.html` pages (lazy load, spinner, slider). | — | the application's script, read as text, 2026-10-31 | open |
