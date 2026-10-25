# lint-suite fixtures

A miniature pack for `node scripts/lint-suite.mjs --self-test`. Every line the linter must report
carries an `expect-finding: <rule>` marker; every other line looks close to a defect and must stay
unreported. Nothing here is built, linted or run.
