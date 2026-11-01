# Juice Shop: application notes

Facts about the application that its specs rely on and its pages do not show. Each one says where
it shows, how it was observed and its status: `by design` (the application means it), `defect` (with
its key) or `open` (not yet known which). The routes are fragments after `<base_url>`.

| Fact | Where | Observed | Status |
|---|---|---|---|
| From 960 px wide the toolbar has an account button; below that the account is a section of the side navigation. The tablet project (810 px) gets the side navigation, the landscape tablet (1080 px) the toolbar. | every route | `AccountMenu` on every device project in the sign-in smoke, 2026-10-24 | by design |
| A wrong password and an unknown email give the same message, "Invalid email or password." | `/#/login` | the sign-in smoke and `LoginPage.error()`, 2026-10-24 | by design |
| A login through the form moves to `/#/search`. | `/#/login` | the sign-in smoke, 2026-10-24 | by design |
| Without a `language` cookie the shop announces a language change in a notification that appears or not depending on timing; every context sets the cookie. | every route | intermittent extra notification in early smoke runs, 2026-10-24 | by design |
| The welcome and cookie banners cover the page until dismissed; their cookies dismiss them before the first page loads. | every route | the sign-in smoke, 2026-10-24 | by design |
| A signed-in customer can still open `/#/login`, which shows the form again. | `/#/login` | read-only look as `customer`, 2026-10-25 | accepted by the owner, 2026-10-25 (LOGIN G2) |
| `/#/basket` opens without a session: "Your Basket (anonymous)", empty, with no basket request and no redirect. | `/#/basket` | read-only look without a session, 2026-10-25 | defect LOCAL-3 (BASKET G1) |
| A customer reads another customer's basket by its id: `GET /rest/basket/<id>` answers with that basket, and the page shows it when session storage holds the id. A training vulnerability of the application. | `/#/basket` | a throwaway spec with two accounts it created, 2026-10-25 | defect LOCAL-1 (BASKET G2) |
| The search page asks for the whole catalogue (`/rest/products/search?q=` with an empty `q`) and filters it in the page, so the term never reaches the server. | `/#/search` | read-only look, 2026-10-25 | by design |
| The search term is put into the page as markup: `<b>` in the term becomes a `<b>` element. A training vulnerability of the application. | `/#/search?q=…` | read-only look, 2026-10-25 | defect LOCAL-2, a training vulnerability (SEARCH G1) |
| The title of the product list ("All Products", "Search Results - <term>") is plain text, not a heading; a page object finds it by its text. | `/#/search` | read-only look, 2026-10-25 | defect LOCAL-5 (SEARCH G2) |
| The toolbar's search box has no accessible name; a page object reaches it through the "Open search" button. | every route | app map and read-only look, 2026-10-25 | defect LOCAL-6 (SEARCH G3) |
| The counter under the password field reads `/20`, while the field takes 40 characters. | `/#/register` | read-only look, 2026-10-25 | defect LOCAL-4 (SIGNUP G1) |
| `GET /api/Quantitys/` holds each product's stock and its limit per customer; the basket's boundaries come from it, not from the page. | `/#/basket` | read on 2026-10-25: Apple Juice limit 5, one product with stock 0 | by design |
| Texts are translated after the page loads, so a page read too early shows the raw keys (`CHECKOUT_FOR_BONUS_POINTS`); wait for a translated text, never for a fixed time. | every route | read-only look, 2026-10-25 | by design |
| The checkout steps keep the chosen address, delivery method and card in the page's session; a step opened directly asks for `/api/Addresss/null`, `/api/Deliverys/null` or `/api/Cards/null` (`400`), and the summary opened that way places an order with no address, delivery or payment. | `/#/order-summary` | a throwaway script with an account it created, 2026-10-26 | defect LOCAL-7 (CHECKOUT G1) |
| An order placed through `POST /rest/basket/<bid>/checkout` empties the basket and answers the order id; `GET /rest/order-history` lists the customer's orders with `totalPrice`, `deliveryPrice` and `eta`, and answers `500` without a token. | `/#/order-completion/<ORDER_ID>` | a throwaway script, 2026-10-26 | by design |
| `GET /rest/track-order/<ORDER_ID>` answers without a session with the order, its email's vowels starred. | `/#/track-result/new?id=<ORDER_ID>` | API read, 2026-10-26 | defect LOCAL-8 (CHECKOUT G3) |
| The order summary and the completion page show 0.00¤ and raw `{{bonus}}` until their answers arrive; wait for a product row, never for the network to go quiet (socket.io keeps it busy). | `/#/order-summary`, `/#/order-completion/<ORDER_ID>` | early reads, 2026-10-26 | defect LOCAL-13 (CHECKOUT G8) |
| `GET /rest/user/whoami` reads the session from the `token` cookie and ignores the bearer header, which the other calls take. | the API | TC-JOURNEY-02's read-back, 2026-10-26 | by design |
| The security question list of the sign-up form opens empty, and stays empty, when it is opened before `GET /api/SecurityQuestions/` answers; its overlay also swallows a click sent while it closes. | `/#/register` | TC-JOURNEY-02 runs, 2026-10-26 | by design |
| Each order uses up stock (`GET /api/Quantitys/`), and only a restart gives it back; the stock a start gives a product varies (Apple Juice had 81, 39 and 84 after three starts). A session of repeated checkout runs can empty it, and adding the product then answers `400` "We are out of stock!". | `/#/basket`, the checkout | repeated checkout runs, 2026-10-26 | by design |
| There is no way to delete an account, through the UI or the API. Accounts a run creates stay until the container restarts, and a restart empties the database. | the account | the API has no delete operation for users, 2026-10-24 | by design |
