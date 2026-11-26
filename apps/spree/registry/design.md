---
feature: DESIGN
title: Admin design system and reduced motion
routes: [/dashboard/login, /dashboard/forgot-password, /dashboard/<store id>, /dashboard/<store id>/orders]
contract: docs/features/design.md
actors: [anonymous, admin]
dimensions:
  responsive: applies
  perf: applies
  security: 'n/a: the cases read styles of pages whose security cases are LOGIN''s and PWRESET''s; nothing is typed or stored'
  layout: applies
  navigation: applies
  a11y: applies
  content: 'n/a: no user text on these components; long texts in the fields are LOGIN''s and PWRESET''s'
test_data:
  <TOKENS>: the tokens of apps/spree/design-tokens.json, named in each title by their path (color.primary, font.size.sm)
---

# Admin design system and reduced motion cases

Designed from the contract of 2026-11-25. TC-DESIGN-02 lost the orders page and TC-DESIGN-12 was
added the same day, approved, when the contract's REQ-DESIGN-02 was corrected and REQ-DESIGN-11
added: intake had measured `/dashboard/orders`, which opens the dashboard's home. During automate the
same day, TC-DESIGN-08's title came to name the buttons it checks, Add filter and Sort, the two the
orders page's toolbar shows on every device (a narrow screen hides Export and Columns), where it
had said "the buttons". Every rule is cited, REQ-DESIGN-10 twice: once with the
reports held back by a mock, so the loading placeholders are there to stop, and once on the real
page.

"Drawn with" means `tokenMismatches` finds no property off its token (ADR 0015); the property each
token applies to is written in the title and is the case's expected result. The tokens are read
from `design-tokens.json`, never from the page.

## Cases

| ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|---|---|
| TC-DESIGN-01 | the sign-in, the forgot-password page and the dashboard are drawn on color.background, with text in color.foreground, font.family.sans and font.size.base | REQ-DESIGN-01 | equivalence-partition | medium | @regression @layout | all | automated | specs/design/tokens.spec.ts | |
| TC-DESIGN-02 | the level-1 heading of the sign-in, of the forgot-password page and of the dashboard's home is in color.foreground, font.family.sans, font.size.2xl and font.weight.bold | REQ-DESIGN-02 | equivalence-partition | medium | @regression @layout | all | automated | specs/design/tokens.spec.ts | |
| TC-DESIGN-03 | "Sign in" and "Send reset link" are drawn with a color.primary background, color.primary-foreground text, radius.lg corners, font.family.sans, font.size.sm and font.weight.medium | REQ-DESIGN-03 | equivalence-partition | high | @regression @layout | all | automated | specs/design/tokens.spec.ts | |
| TC-DESIGN-04 | once the focus leaves it, Email on the sign-in and on the forgot-password page has a color.card background, color.foreground text, a color.border border, radius.md corners and font.weight.normal, and its label is color.foreground, font.size.sm and font.weight.medium | REQ-DESIGN-04 | equivalence-partition | medium | @regression @layout | all | automated | specs/design/tokens.spec.ts | |
| TC-DESIGN-05 | Email's border is color.border at rest and turns color.ring with the focus, on the sign-in and on the forgot-password page | REQ-DESIGN-05 | state-transition | medium | @regression @navigation | all | automated | specs/design/tokens.spec.ts | |
| TC-DESIGN-06 | Email's text is font.size.touch-control on the touch projects (tablet, mobile) and font.size.base on the desktop projects, while "Sign in" stays font.size.sm on both | REQ-DESIGN-06 | equivalence-partition | medium | @regression @responsive | all | automated | specs/design/tokens.spec.ts | |
| TC-DESIGN-07 | "Forgot password?" and "Back to sign in" are color.link and font.size.sm at rest, and under the pointer turn color.link-hover and underlined | REQ-DESIGN-07 | state-transition | medium | @regression @layout @navigation | all | automated | specs/design/tokens.spec.ts | |
| TC-DESIGN-08 | without a motion preference, the buttons Add filter and Sort of the orders page transition transform, translate and scale over 0.1 s, and the open user menu opacity, transform, translate and scale over 0.1 s | REQ-DESIGN-08 | use-case | low | @regression | all | automated | specs/design/motion.spec.ts | |
| TC-DESIGN-09 | the motion of the sign-in, the forgot-password page, the dashboard, the orders page and the open user menu, present without a preference, is gone with prefers-reduced-motion: reduce, and the menu still fades in through opacity | REQ-DESIGN-09 | state-transition | high | @regression @a11y | all | automated | specs/design/motion.spec.ts | |
| TC-DESIGN-10 | with the dashboard's reports held back, its loading placeholders pulse without a preference, and with prefers-reduced-motion: reduce none pulses and nothing on the page moves | REQ-DESIGN-10 | state-transition | medium | @regression @perf @a11y @mocked | all | automated | specs/design/motion.spec.ts | |
| TC-DESIGN-11 | with prefers-reduced-motion: reduce, once the dashboard and the orders page have loaded with their real data, no running animation moves anything and none repeats | REQ-DESIGN-10 | use-case | medium | @regression @a11y | all | automated | specs/design/motion.spec.ts | |
| TC-DESIGN-12 | the level-1 heading of the orders page is in color.foreground, font.family.sans and font.weight.semibold, at font.size.2xl where the project's viewport is 640 px wide or more and font.size.xl where it is narrower | REQ-DESIGN-11 | equivalence-partition | medium | @regression @layout @responsive | all | automated | specs/design/tokens.spec.ts | |

## Notes

- **Partitions.** The token cases take one page per partition the contract names: signed out (the
  sign-in, the forgot-password page) and signed in (the dashboard, the orders page). The touch and
  mouse partitions of TC-DESIGN-06 come from the device project's form factor, and the width
  partitions of TC-DESIGN-12 from the project's viewport against `breakpoints.section_heading`, not
  from the page, so neither case can agree with a page that picked the wrong media query.
- **The menu's fade** (TC-DESIGN-09) is the `opacity` transition of 0.1 s the stylesheet's reduce
  rule keeps on every element, the menu included; the fade drawn on screen is not measured.
- **Controls.** TC-DESIGN-05, TC-DESIGN-07, TC-DESIGN-09 and TC-DESIGN-10 read the state before and
  after (rest and focus, rest and hover, no preference and `reduce`), so none can pass on a page
  that never changed. TC-DESIGN-08 holds the motion TC-DESIGN-09 removes, by property.
- **Data.** Nothing is written: the `admin` actor signs in and the cases read styles, move the
  pointer, move the focus and open the user menu, which Escape closes.
- **Devices.** All: "User menu" stays on the page on every device, beside the sidebar or above
  its sheet.
