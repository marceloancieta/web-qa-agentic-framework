# Sample rule

Paths from the root resolve: `scripts/tool.mjs`, `docs/guide.md`, `scripts/tool.mjs:12` and
`docs/guide.md#usage`.
A path from a pack resolves too: `docs/app-notes.md`.
A path from this file resolves: `../../docs/other.md`.

A missing script is reported: `scripts/gone.mjs`. <!-- expect-finding: broken-reference -->
A missing doc in a pack is reported: `docs/features/none.md`. <!-- expect-finding: broken-reference -->

Not paths, so not read: `npm run lint:docs`, `@playwright/test`, `a11y-known.json`, `apps/<pack>/app.json`,
`specs/**/*.spec.ts`, `pages/`, `TC-LOGIN-03`, `text/html`.
Output folders are not read: `reports/tm/manifest.json`, `test-results/last-run.json`.

```sh
node scripts/also-gone.mjs   # inside a fence, not read
```
