---
name: qa-design
description: >-
  Phase 1 of UI test work. Designs the cases for one feature from its approved feature contract and
  writes the registry apps/<pack>/registry/<feature>.md: TC-<FEATURE>-NN ids, the rule each case
  cites, a technique, a priority, tags, devices and status draft, with every quality dimension
  declared. Use when the user asks to design or plan test cases, asks what should be tested on some
  pages, or wants the coverage of a feature reviewed. Writes Markdown and decision-table YAML only:
  no specs, no browser, no test-management calls. Ends at a review gate.
---

# qa-design: write the registry

**Mode: design** (`.claude/rules/modes.md`). The contract and the app map are the sources; this
phase opens no browser.

## Inputs

- The approved contract `apps/<pack>/docs/features/<feature>.md`. Missing or thin: offer `qa-intake`
  first.
- The app map for the form constraints and the breakpoints of `app.json`, and the pack's skill.
- An existing registry of the feature: extend it and keep its numbering; a published id never
  changes (`.claude/rules/registry.md`).

## Steps

1. **Derive the cases**, naming one technique of `scripts/lib/registry.mjs` `TECHNIQUES` per case:
   - **Equivalence partitions and boundaries** from each form constraint: `maxlength` and one past
     it, an empty `required` field, a value the `pattern` refuses, the `type` an input takes.
   - **State transitions** for what the page goes through: signed out and in, empty and full, the
     loading, error and success states of the contract, Back and reload in each.
   - **Decision tables** when the result depends on a combination of conditions. The table goes to
     `apps/<pack>/rules/<case id>.yaml`, in the format of `scripts/lib/decision-table.mjs`, one
     rule per row, and the spec walks it. `lint-suite` reports a combination no rule covers, two
     rules that disagree, and a `decision-table` case without its table.
   - **Pairwise over devices** when a case does not need every device project: say which pairs of
     device and condition the set covers, in the notes under the table.
   - **Error guessing** for what UIs get wrong: a double submit, text that is very long or injected,
     a session that expired, a deep link to a page that needs a role.
2. **Cover every dimension the contract says applies** with at least one case carrying its tag
   (`.claude/rules/tagging.md`): a breakpoint without horizontal scroll, a loading indicator through
   a delayed mock, the security checks of architecture section 6b, the page health guard and visual,
   focus and disabled states, axe and the keyboard, boundary and very long texts. A dimension that
   does not apply keeps the contract's `n/a` reason.
3. **Ask, for each case that writes**: what data does it create, and can it remove it? Can its
   result be checked through `api/` rather than a toast? Can another case's data change what it
   sees? A case that leaves the application unusable for others is `@destructive` and names its
   recovery.
4. **Write each case**: a title a reviewer can check against the screen, the contract rule it cites,
   placeholders for data (`<EMAIL>`), tags with exactly one layer tag, `Devices` as `all` unless the
   contract records a real difference. An answer the application will not give on demand (a 500, a
   timeout, an empty list) comes from a mock and carries `@mocked`; the rule it covers still needs a
   case without a mock.
5. **Fill the registry** from [the template](../../../docs/templates/registry.md), every row
   `draft`. When an open issue already explains a case, its key goes in the Defect column and the
   case still runs as a known gap.
6. **Check**: `npm run lint:suite` (registry shape, dimensions without cases, device reasons),
   `npm run traceability` (every contract rule cited, no rule covered only by mocks) and
   `npm run coverage:status`. A finding is fixed or explained under the table, never left silent.
7. **Review gate.** Show the cases grouped by rule and by dimension, the rules with no case and why,
   and the pairwise choices. Apply the reviewer's changes, then set the approved rows to `approved`.
8. **Hand off** to `qa-automate` with the counts by status, dimension and priority.

## If it stops halfway

A registry of `draft` rows changes nothing: only the reviewer reads drafts. Keep it, or delete it if
the feature is dropped. Renumbering happens in one change or not at all.

## Do not

- Write specs, open the application or publish.
- Rename or reuse a published feature code or case id.
- Type counts or coverage into the registry; the scripts compute them.
