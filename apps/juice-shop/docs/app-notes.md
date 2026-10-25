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
| There is no way to delete an account, through the UI or the API. Accounts a run creates stay until the container restarts, and a restart empties the database. | the account | the API has no delete operation for users, 2026-10-24 | by design |
