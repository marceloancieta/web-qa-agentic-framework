# lint-docs fixtures

A miniature repository for `node scripts/lint-docs.mjs --self-test`. Every line the linter must
report ends with an `expect-finding: <rule>` marker; every other line looks close to a defect and
must stay unreported. See the [guide](docs/guide.md) and the [notes](apps/shop/docs/app-notes.md).
