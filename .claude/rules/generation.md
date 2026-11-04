---
paths:
  - 'apps/**'
---

# Generation: from an approved case to a spec

How an approved registry case becomes code in a pack. The layers and their reasons are in ADR 0005,
the locator order in ADR 0007; `apps/juice-shop/` is the worked example.

## Where things go

| Concern | Lives in | A spec... |
|---|---|---|
| Locators and actions | `pages/`, and `components/` for a part of a page several pages share | asserts on the `Locator`s a page object returns; never builds one (`lint-layers` spec-builds-locator) |
| A signed-in user | the pack's role fixtures (`customer`) or `actor(role)`; `actor(role, { fresh: true })` for an account of the case's own | starts signed in; only the case about the login form goes through it |
| State before and after | `api/` clients bound to the actor's session | prepares data and checks what the UI claims through them; never sends HTTP itself (`lint-layers` spec-sends-request) |
| Data | `builders/`, unique per run, with boundary and very long texts | never types an email or a password |
| Answers the application will not give on demand (500, timeout, empty) | `mocks/`, over `helpers/network.ts` (`mockJson`, `failWith`, `delay`, `offline`, `blockThirdParties`) | calls a mock by name and carries `@mocked`; never calls `page.route` (`lint-layers` spec-routes-network) |
| A business task used by two or more specs | `flows/` | calls the flow; a flow does not assert |
| Combinations of conditions | `rules/<case id>.yaml` decision tables | iterates `loadDecisionTable` (`scripts/lib/decision-table.mjs`), one step per combination |
| Accessibility | the `a11y` fixture: `a11y.expectNoNewViolations(page)` against `a11y-known.json` | scans the state the case is about, after it settles |
| Security headers | the `securityHeaders` fixture: `securityHeaders.expectNoNewGaps(page)` against `headers-known.json`, over every response of the pack's origin the page received; each pack's `specs/security/headers.spec.ts` already sweeps its documents | checks the page after the step whose answer the case is about |
| Visual | the `visual` fixture: `visual.expectToMatch(target, name, mask, { wholePage })`; masks belong to the page object; `wholePage` when the case claims more than the first screen; `visual.expectNotToMatch` with the same arguments when the case claims a view differs from a baseline another step wrote | carries `@visual`; runs only in the visual lane |
| Keyboard, overflow, time, files | `helpers/keyboard.ts`, `helpers/layout.ts`, `helpers/time.ts`, `helpers/files.ts` | asserts on what they return |

## Locators

In page objects and components, in this order (ADR 0007, checked by `lint-harness`):

1. `getByRole` with the accessible name, `getByLabel` for form fields.
2. `getByTestId`, with the attribute the pack's `app.json` declares.
3. `getByText` with a deliberate `exact` (text-without-exact), or a regular expression.
4. CSS, only with a comment on the line or the two above that says why nothing above works
   (css-without-reason).

XPath is refused (xpath-locator), and so is a position without a comment saying why the position is
the identity (positional-selector). **Capture locators from the live page**, read-only: open the
route, read the accessibility tree (the app map has it per route, the browser tools show it live) and
take the role and the name the page really has. A locator written from memory or from another
application is a guess. A page without an accessible name for an element is an accessibility
finding, reported, not hidden behind CSS.

Locators never heal themselves. When one stops matching, the test fails and the page object is
changed in review.

## Every case

1. **The title starts with the case id and ends with its tags**, exactly the registry's Tags cell:
   `TC-LOGIN-03 a wrong password gets a generic message @regression @security`. The id gives the
   result its identity; the tags follow `.claude/rules/tagging.md`, and `lint-suite` tags-mismatch
   compares them with the registry.
2. **Preconditions as skips with a reason.** A case that writes skips with the reason when the
   environment's `allow_writes` is `false`. Missing data in the wrong state fails instead of
   skipping; nothing skips silently.
3. **Arrange through actors and `api/`, act through pages, assert with web-first assertions**:
   `await expect(locator).toBeVisible()`, `toHaveText`, `toHaveURL`, `toBeDisabled`, `toBeFocused`,
   `toMatchAriaSnapshot`. A value read once (`isVisible()`, `textContent()`) and compared does not
   retry and passes or fails by timing.
4. **No fixed waits** (`waitForTimeout`, `setTimeout`: fixed-wait). Wait for what the user would
   see: an element, a URL, a response.
5. **Every assertion runs every time.** No assertion only in one branch of an `if` or in a `catch`
   (optional-assertion). A difference between devices is a tag and a registry reason, not a branch.
6. **The case proves its own result.** Assert on what the case created, and check through `api/`
   what the UI claims to have done when the claim matters: a success toast does not prove the change.
7. **Known gaps arm right before the action**: `test.fail(true, await knownGap('<KEY>', why))`, with
   `@known-gap` in the title and no `expect.soft` above the arm (soft-before-arm).
8. **The page health guard stays on.** Switching it off takes a reason
   (`test.use({ pageHealth: { off: '<why>' } })`).
9. **Steps** (`test.step`) are optional; a step's name says what it does to the page.

## A journey

A journey's case (`@e2e`, `.claude/rules/registry.md`) differs from a feature's in three ways:

1. **Every step it claims goes through the UI**, as a user would take it, signing in through the
   form included; arranging a step through `api/` would skip the hand-over the journey exists to
   prove. Only what comes before the journey (the account, the stock) is arranged through `api/`.
2. **The steps are flows** (`flows/`), the same business tasks the feature specs reuse, so a change
   to a page breaks one flow, not every journey. A flow acts and returns what it saw; the journey
   asserts at each hand-over, inside a `test.step` named after the step.
3. **The end is proved through `api/`**: the order, the account or the record the journey claims to
   have created is read back from the application, not from the last screen.

A journey runs on every device project like any case, and it uses data of its own: an account
created for it, never the worker's shared one, since it changes what the account holds.

## Data and secrets

- No real people, accounts or credentials anywhere in a pack, its skill or the docs. Prose uses
  placeholders (`<EMAIL>`), code uses builders. Fake secrets in tests are built while the test
  runs, never written as a credential-shaped literal.
- Only the login case and a journey type a password, with an account the run created; every other
  case starts signed in through the API, so no password reaches a trace. Screenshots mask the sensitive fields
  the page object names.
- `.auth/` holds browser sessions; it is ignored by git and guarded by `secret-guard`.
- Playwright's own artifacts (the failure context, traces, the HTML report, the Allure results) record
  what a case types. The redaction reporter removes the run's known secrets from them once the run
  ends (`helpers/redact-reporter.ts`), so a typed secret must be one the run knows: a password from
  `generatedPassword()` or an actor's account, never one a spec makes up.
- Modules do no I/O at import time, so one failure cannot abort the collection of a whole project.

## Before calling a spec done

`npm run types:check`, `npm run lint`, `npm run lint:qa`, then the spec against the environment on
every device project of the environment, twice (`--repeat-each=2`), green or red as designed. A
visual case also runs in the visual lane. Then the case is marked `automated` in its registry, with
its spec file.
