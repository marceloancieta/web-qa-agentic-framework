# 0015 - Design tokens and reduced motion are checked against the browser's own rendering

**Status:** Accepted (2026-11-25)

## Context

Two parts of the layout and perceived-performance dimensions had no check of their own:

- **Design tokens.** A design system names its values (the action colour, the body font, the radius
  of a control) and a component should be drawn with them. Visual regression notices when a
  component changes, but not whether it was right to begin with, and a pixel threshold lets a
  colour drift a little. Comparing computed styles as text does not work either: one colour reaches
  the page as `oklch(…)`, `#…` or `rgb(…)` depending on the stylesheet and the browser, and one size
  as `rem` or `px`.
- **Reduced motion.** `prefers-reduced-motion: reduce` asks a page not to move things that the
  user did not ask to move (WCAG 2.3.3). How smooth an animation is cannot be measured reliably in a
  test browser, but what still moves under the preference can be read.

## Decision

**A pack's design system is a `design-tokens.json`, and a case compares a component with it the way
the browser draws both.**

- **The format is the Design Tokens Community Group format, in a subset.** Groups, tokens with
  `$value` and `$type` (inherited from a group), `$description`, and aliases `{group.token}`.
  Types: color, dimension, fontFamily, fontWeight, duration and number. A colour is CSS colour
  text; a dimension or a duration is CSS text or `{ value, unit }`. Composite types (shadow,
  typography, border) are left out until a pack needs them. `helpers/design-tokens.ts` reads the
  file, resolves the aliases and refuses it with every problem by token; a unit test reads the file
  of every pack in the checkout, so a broken one fails the gates.
- **Values come from the design system, not from the page under test.** The tokens of a pack are
  written from what the application declares as its design system (its stylesheet's custom
  properties, its theme), recorded at intake like any other contract fact. Reading the component's
  own style and calling it the token would make every case pass.
- **A colour is compared as the pixel it paints; anything else as the browser resolves it.**
  `tokenMismatches(component, { property: token }, tokens)` paints the token's colour and the
  computed colour on a one-pixel canvas in the page and compares the channels, one step apart at
  most for the rounding of a colour-space conversion. Any other value is set on a hidden probe
  element beside the component and read back computed, so `0.8125rem` and `13px`, or `bold` and
  `700`, compare equal in every engine. The style is read once the component's finite transitions
  have finished. It returns the properties that differ, with both values; a token the pack does not
  have is a mistake in the case and throws.
- **Which component uses which token is the case's expected result.** The page object locates the
  component; the spec names the properties and their tokens and asserts that nothing differs.
- **Reduced motion is emulated by Playwright and read from the page.** A case sets
  `reducedMotion: 'reduce'` (`test.use` or `page.emulateMedia`) and asserts on `helpers/motion.ts`:
  `motionOf(locator, { subtree })` lists the transitions declared on properties that move or resize
  (transform, translate, rotate, scale, position, margins, size, `all`) and the running animations
  whose keyframes set them; `pageMotion(page)` lists the running animations of the whole page that
  move, and `animationsOf(locator, { subtree })` every running animation whatever it sets, for a
  case about one that should stop although it is not motion (a loading pulse). A
  change of colour, opacity, shadow or blur is not motion and is not reported. A case that claims
  the page stops moving shows the motion is there without the preference, so it cannot pass on a
  page that never moved.

## Consequences

- A token check fails only on a real difference, in every engine and whatever notation the
  stylesheet used; a small colour drift that a visual threshold lets through is caught.
- The token file is a contract artifact: when the design system changes on purpose, the file
  changes in a reviewed commit, as a baseline would.
- Motion that is essential to the meaning (a progress spinner) is still reported under the
  preference; the case decides whether it is allowed, and says so in its assertion.
- An animation that has already finished is no longer running and is not seen: a case reads the
  motion while it would happen (a declared transition, or an animation right after the action that
  starts it).
