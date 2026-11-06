# cited-status fixtures

A miniature pack and a `local` tracker for `scripts/__tests__/cited-status.test.mjs`. The tracker
holds `BUG-1` (open), `BUG-2` (done) and `BUG-3` (in progress); `BUG-9` is not in it, and `BUG-three`
does not match the key pattern. Every line the check must report carries an `expect-finding: <rule>`
marker; every other line looks close to a defect and must stay unreported:

- in Markdown (the registry, the contract, the app notes): a closed key in a code span, inside a
  longer word or in a code block;
- in the spec: a key in a comment, in a string, in a `test.fail` reason of its own, in a method named
  `knownGap` or in another function;
- in the baselines (`a11y-known.json`, `headers-known.json`, `zap-known.json`): a key in a field other
  than `key`, where the marker sits in a `note` or `reason` field because JSON has no comments;
- outside what is read: `docs/glossary.md`.

Nothing here is built, linted or run.
