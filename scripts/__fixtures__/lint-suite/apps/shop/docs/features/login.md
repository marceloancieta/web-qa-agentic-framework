# Login contract

## Business rules

The rules the cases cite. A rule's source may contain an escaped \| pipe.

| ID | Rule | Source |
|---|---|---|
| REQ-LOGIN-11 | The form shows its fields with labels | the app map |
| REQ-LOGIN-12 | A locked account sees why \| and what to do | the story; measured on the form |
| REQ-LOGIN-1 | A short id | the story | <!-- expect-finding: contract-shape -->
| REQ-LOGIN-13 | A rule without a source | | <!-- expect-finding: contract-shape -->
| REQ-LOGIN-11 | The same id twice | the story | <!-- expect-finding: contract-shape -->

## Acceptance criteria

| ID | Rule | Source |
|---|---|---|
| REQ-LOGIN-99 | a table after the business rules is not read | none |
