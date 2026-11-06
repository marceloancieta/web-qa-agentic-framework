# Backlog

The self-test checks this file against a fixed history of two commits, `aaaaaaa` and `ccccccc`
(`SELF_TEST_HISTORY` in the linter). A hash outside the **Done** table, such as `bbbbbbb` here, is
not read.

## v0.1.0

| Id | Item | Status |
|---|---|---|
| OPEN-01 | An open row whose item names `bbbbbbb`, not read. | todo |

## Done

| Id | Item | Closed by |
|---|---|---|
| DONE-01 | A short hash in the history. | `aaaaaaa` |
| DONE-02 | A full hash in the history, in capitals. | `CCCCCCC2222222222222222222222222222222CC` |
| DONE-03 | Two hashes in the history. | `aaaaaaa`, `ccccccc` |
| DONE-04 | The item names `bbbbbbb`, which is not read; the closing commit is. | `ccccccc` |
| DONE-05 | A pipe in the item, `a \| b`, keeps the columns. | `aaaaaaa` |
| DONE-06 | Code that is not a hash, such as `v0.1.0`, is not read. | `v0.1.0`, `aaaaaaa` |
| DONE-07 | A hash missing from the history. | `bbbbbbb` | <!-- expect-finding: closing-commit -->
| DONE-08 | One hash in the history and one missing. | `aaaaaaa`, `ddddddd` | <!-- expect-finding: closing-commit -->
| DONE-09 | A full hash whose short form is in the history but which is not. | `aaaaaaa0000000000000000000000000000000aa` | <!-- expect-finding: closing-commit -->
| DONE-11 | Moved here with no closing commit. |  | <!-- expect-finding: closing-commit -->
| DONE-12 | Code that is not a hash is no closing commit. | `v0.1.0` | <!-- expect-finding: closing-commit -->

```md
| DONE-10 | Inside a fence, not read. | `eeeeeee` |
```

## Notes

| Id | Item | Closed by |
|---|---|---|
| NOTE-01 | A table under another heading, not read. | `fffffff` |
