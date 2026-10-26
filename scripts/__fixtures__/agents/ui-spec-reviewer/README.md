# ui-spec-reviewer evaluation fixtures

Input for evaluating the `ui-spec-reviewer` agent (`.claude/agents/ui-spec-reviewer.md`): a
registry for an imaginary basket feature of the Juice Shop pack, the blocks its specs use, and two
specs, with seeded defects and clean look-alikes.

| File | Holds |
|---|---|
| `basket-review.md` | the registry, feature `BREV`, cases TC-BREV-01 to TC-BREV-12 |
| `review-blocks.ts` | the page objects `BasketReviewPage` and `SearchReviewPage`, the client `BasketReviewApi` and `emptyBasketOf` |
| `basket-core.spec.ts` | TC-BREV-01 to 05, 07 and 12 |
| `basket-edges.spec.ts` | TC-BREV-06 and 08 to 11 |

Nothing here is collected or run: the folder is outside `apps/*/specs/` (the Playwright projects of
each pack) and outside the scopes of the linters, and `tsc`, ESLint, Prettier and `lint-docs`
exclude `scripts/__fixtures__/`. The specs import the real Juice Shop fixtures and helpers, so they
read like pack specs. The products, prices and the limit of 5 are the shop's own (2026-10-25).

## Markers

A seeded defect carries `// expect-review: <check-id>`, either at the end of the offending line or
alone on the line right above it (for a finding about a whole test, above its `test(` call). Each id
is one of the checks the agent catalogues, and each catalogued check is seeded at least once.
Unmarked code is meant to be clean: a finding on it is a false positive.

## Running an evaluation

1. Make marker-free copies; each marker becomes nothing or an empty line, so the lines stay where
   they are:

   ```sh
   out="<scratchpad>/review-eval"; mkdir -p "$out"
   for f in scripts/__fixtures__/agents/ui-spec-reviewer/*.ts; do
     sed -E 's#[[:space:]]*// expect-review: [a-z, -]+$##' "$f" > "$out/$(basename "$f")"
   done
   ```

2. Launch the agent with the two spec copies as the specs and the copy of `review-blocks.ts` as
   their blocks, saying that each copy stands for the file of the same name in
   `scripts/__fixtures__/agents/ui-spec-reviewer/` (imports resolve from there) and that it must
   not open this README or the originals; the registry `basket-review.md` from this folder with
   cases TC-BREV-01 to TC-BREV-12; the pack `juice-shop`. `npm run lint:qa` does not scan these
   files and `--list` finds no tests in them; both are expected.
3. Compare the report with the tables below: each expected finding with the same case, check and
   line, each verdict, and every finding outside the table (a look-alike flagged, or a guess).
   Severity is part of the result; a different severity is a partial match.

## Expected findings

| Case | Check | Severity | File | Scenario that still passes, or fails on a working page |
|---|---|---|---|---|
| TC-BREV-01 | `brittle-locator` | major | `review-blocks.ts` | `checkout()` finds Checkout by Angular Material classes, with a reason that is not true: the app map has `button "Checkout"`. A Material upgrade breaks it, and any other primary button on the page matches it. TC-BREV-12 uses it too; the finding belongs to either case. |
| TC-BREV-02 | `title-claim` | blocker | `basket-core.spec.ts` | Only the notification and the toolbar count are checked; a basket that stores nothing, or stores quantity 3, passes although the title claims the basket lists it with quantity 1. |
| TC-BREV-03 | `timing` | major | `basket-core.spec.ts` | The toolbar's text is read once, right after the click; it reads 1 while the add is in flight, so a working shop fails at random. |
| TC-BREV-03 | `brittle-locator` | major | `review-blocks.ts` | `quantityOf()` ignores its product and takes the first quantity cell by a framework class and a position; with the rows in another order it reads another product. |
| TC-BREV-04 | `coincidental-pass` | blocker | `basket-core.spec.ts` | One product of quantity 1: the total equals its price, so a page that ignores the quantities passes. The registry asks for two products in different quantities and 6.97¤. |
| TC-BREV-07 | `data-safety` | blocker | `basket-core.spec.ts` | It adds a product to basket 1, which belongs to an account the shop ships with and that other cases and people see. |
| TC-BREV-12 | `vacuous-assertion` | blocker | `basket-core.spec.ts` | `toBeAttached()` holds for a disabled button as well; a Checkout that never enables passes. |
| TC-BREV-06 | `case-shape` | major | `basket-edges.spec.ts` | The known gap is armed before the arrange, so an actor or a page that fails to open counts as the armed failure and the case reads as `failed as armed`. |
| TC-BREV-08 | `missing-oracle` | major | `basket-edges.spec.ts` | Only the page is checked after the removal; a page that hides the row while the API keeps the item passes. The registry asks for the read-back through `BasketReviewApi.items()`. |
| TC-BREV-09 | `registry-fidelity` | major | `basket-edges.spec.ts` | The case is `draft`; only approved cases are automated. |
| TC-BREV-10 | `layering` | major | `basket-edges.spec.ts` | The overflow is measured in the spec through `page.evaluate`, beside the `horizontalOverflow` helper every pack uses; the two drift apart, and a fix to the helper never reaches this case. |

## Expected verdicts

- `basket-core.spec.ts`: `block`
- `basket-edges.spec.ts`: `changes`

## Look-alikes (not findings)

- TC-BREV-01 takes the email for the title from the actor's account, not from a literal, and
  asserts an empty basket the case emptied itself.
- TC-BREV-02 registers `waitForResponse` before the click that sends the request.
- TC-BREV-03 reads the basket through the API only after the page's web-first assertion has shown
  2, so the write has landed.
- TC-BREV-05 reads the limit from the shop's stock table, and reads the quantity back after the
  refusal is on screen.
- TC-BREV-06 checks that the basket title is absent on a page where, with the defect, it is present:
  `toHaveCount(0)` there can fail.
- TC-BREV-07 arms the known gap right before the refused read, with `@known-gap` and the
  registry's key.
- TC-BREV-11 is a use-case with the customer's own email, as the registry designs it, and measures
  the clipping with `clippedText` once the title shows its full text. A very long email would be a
  boundary case of its own, which this registry does not have.
- `SearchReviewPage.notification()` uses a regular expression for a text that ends with the
  product; `basketButton()` and `BasketReviewPage.row()` use the role and the name the app map
  shows.
- `emptyBasketOf` deletes only the items of the case's own basket, found by the id its login
  returned.

## Keeping this in sync

`node --test scripts/__tests__/agent-review-fixtures.test.mjs` checks that the agent's catalogue
and the markers name the same checks, that the expected findings above match the markers file by
file, that every case in the table and in the specs is a case of the registry, that the registry
parses, and that the verdicts follow from the severities. A new check in the agent needs a seed
here and a row above.
