# lint-harness fixtures

A miniature pack for `node scripts/lint-harness.mjs --self-test`. Every line the linter must report
ends with an `expect-finding: <rule>` marker; every other line is correct code that looks close to
a defect and must stay unreported. Nothing here is built, linted or run.
