# Shop: application notes

| What the application does | Where | How it was seen | Handling |
|---|---|---|---|
| The total ignores the second product. | `/basket` | read-only look | defect BUG-1 |
| The empty basket has no message. | `/basket` | read-only look | defect BUG-2 | <!-- expect-finding: closed-key -->
| A removed product stays in the total. | `/basket` | read-only look | defect BUG-9 | <!-- expect-finding: unknown-key -->

Not citations: `BUG-2` in a code span, XBUG-2 and BUG-2b.

<!-- BUG-9 in a reviewer's note is not a citation -->
