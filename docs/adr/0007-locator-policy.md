# 0007 - Locator policy, and no self-healing locators

**Status:** Accepted (2026-10-24)

## Context

Most flaky or misleading UI tests trace back to how they find elements: positional selectors that
break on any layout change, XPath tied to the DOM tree, CSS classes owned by a styling library, text
matches that hit the wrong element. Locators that follow what a user perceives (role, label,
accessible name) survive refactoring and also prove the page is accessible.

Some tools offer "self-healing" locators: when a locator stops matching, the tool picks the most
similar element and carries on. That keeps a run green while the page changed in a way the test was
written to notice: a renamed button, a missing label, the wrong element under the same text.

## Decision

Locators are chosen in this order, by the generation rule and checked by `lint:harness` (GATE-02):

1. `getByRole` with the accessible name, and `getByLabel` for form fields.
2. `getByTestId`, with the attribute each pack declares in `app.json` (`testIdAttribute`).
3. `getByText` with a deliberate `exact`.
4. CSS only with a comment that says why nothing above works.

XPath and positional selectors (`nth-child`, index-based `nth()` without a reason) are refused.
Locators live in page objects and components, never in specs (ADR 0005).

**Self-healing locators are rejected.** A locator that stops matching fails the test; the fix is a
reviewed change to the page object, and a missing accessible name is reported as an accessibility
defect.

## Consequences

- Locator failures are signals, investigated like any other failure.
- Pages without accessible names or test ids cost more to automate, and the cost is visible as
  accessibility findings or a request to the application's team.
