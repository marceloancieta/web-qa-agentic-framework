# cited-status fixtures

A miniature pack and a `local` tracker for `scripts/__tests__/cited-status.test.mjs`. The tracker
holds `BUG-1` (open), `BUG-2` (done) and `BUG-3` (in progress); `BUG-9` is not in it. Every line the
check must report carries an `expect-finding: <rule>` marker; every other line looks close to a
defect (a closed key in a code span, inside a longer word, in a code block or outside the
registries and contracts) and must stay unreported. Nothing here is built, linted or run.
