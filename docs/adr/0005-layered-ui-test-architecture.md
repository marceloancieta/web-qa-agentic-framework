# 0005 - Page objects, components, role fixtures and optional flows

**Status:** Accepted (2026-10-24)

## Context

UI suites decay in familiar ways: locators copied into specs, page classes that grow without limit,
logins repeated in every test, and checks that run once instead of retrying until the page settles.
The framework needs a structure that adopters already know, that a linter can enforce, and that
keeps assertions where Playwright can retry them.

Three options were compared (details in
[architecture section 1.2](../architecture.md#12-pattern-page-object-model-with-components-role-fixtures-and-optional-flows)):

- **Page objects only.** Standard and light, but pages grow large, shared parts of a page are
  duplicated, and each role signs in by hand.
- **Screenplay** (actors, abilities, tasks, questions). Good isolation and reuse, but a class per
  interaction and question, a steep start for adopters, a minority pattern in Playwright with
  TypeScript, and questions such as `isVisible()` that answer once and do not retry. Its usual
  library brings its own reporting, which would compete with the test-management adapters.
- **Page objects with components, role fixtures and optional flows.** Playwright's documented
  recommendation plus its own fixture idiom.

## Decision

The third option, in these layers (top to bottom):

| Layer | Owns | Never |
|---|---|---|
| specs | web-first assertions and the case's orchestration | locators, `page.route`, CSS |
| flows (optional) | a business task over pages and `api/`, written once the same sequence appears in two specs | assertions |
| actors | a role fixture: a signed-in browser context plus the pack's API client for the same user | UI logins |
| pages and components | locators and actions; return `Locator`s; components are page objects for a shared part of a page | `expect` |
| `api/`, `mocks/` | the pack's state clients and network handlers | being called around the layers above |
| core (`helpers/`, `fixtures/`) | config, actors, evidence, accessibility, visual, network, redaction, data | importing a pack |

`lint:layers` (GATE-01) checks the boundaries. "Actor" names the fixture only; there are no
abilities or questions.

## Consequences

- Specs read as the case: arrange through actors and `api/`, act through pages, assert with
  `expect(locator)`.
- The same layers as the sibling API framework, so its linters and fixtures adapt with small changes.
- A team that prefers Screenplay can build tasks on top of pages; the core will not offer it.
