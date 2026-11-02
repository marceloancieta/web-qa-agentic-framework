# Test management and trackers

How designed cases reach a test-management tool, how runs are reported, and how issues are filed.
The decisions behind it are in [ADR 0010](adr/0010-test-management-and-trackers.md).

## The flow

```sh
export QA_RUN_ID=<run id>        # one id for the run, its lanes, its report and its gate
npx playwright test --project='juice-shop-*'
npm run tm:publish               # definitions of automated and published cases, read back
npm run tm:report                # the latest run, attributed to cases, read back
npm run tm:publish -- --case TC-LOGIN-03   # repair one case without touching the rest
```

- `tm:manifest` writes `reports/tm/manifest.json`: every case of the registries with its spec test,
  and the latest run's results by identity (`<pack>-<version>-<TC id>`). Results that cannot be
  attributed are listed under `excluded`, each with its reason.
- `tm:publish` sends only cases whose registry status is `automated` or `published`; drafts,
  approved and blocked cases are listed as held back.
- `tm:report` starts a run, reports the results, and closes the run even when reporting failed.
- Each phase writes `reports/tm/<phase>-<provider>.json` with what was done.

## Choosing a tool

qa-config `test_management.provider`, with its `options`; `QA_TM_PROVIDER` replaces the provider for
one run (CI reports to a tool whose credentials only it holds).

| Provider | Definitions | Runs | Options and credentials |
|---|---|---|---|
| `local` | yes | yes | `dir` (default `reports/tm/local`) |
| `allure-report` | no | yes | builds the HTML report from `allure-results/` |
| `allure-testops` | yes | yes | `endpoint`, `project_id`, `token_env` (default `ALLURE_TOKEN`); each falls back to `ALLURE_ENDPOINT`, `ALLURE_PROJECT_ID` |

In Allure TestOps a case is an automated test case whose `fullName` is the case identity; a result
names its test case by the `ALLURE_ID` label, so a case is published before its first run, and a
result of a case not published to the project is skipped with a reason
(`scripts/tm/adapters/allure-testops/index.mjs` says what a test case holds). TestOps updates a test
case from the results linked to it, so a result carries the name, description and tags its test case
holds, and a report changes no definition. `QA_TM_PROVIDER` is
read before the local env file, so it is set in the shell or the CI job; the options and the token
can come from that file.

## Devices and known gaps

A case runs on every device project of the environment, and is reported once: with the worst status
of its devices, and each device's status under `devices`.

A known gap is armed in the spec right before the action under test and tagged `@known-gap`:

```ts
test.fail(true, await knownGap('LOCAL-12', 'the basket keeps a removed item'));
```

The suite passes while the defect is open. Test management shows the product instead: an open gap is
reported `failed` with its issue link, a fixed gap `passed` with `knownGap: closed`, which means the
arm and the tag must go.

## Trackers

qa-config `tracker.provider`: `local` (a JSON file under `options.dir`), `github` (`options.repo`,
`GITHUB_TOKEN`) or `jira` (`base_url`, `options.project`, `JIRA_USER`, `JIRA_TOKEN`).

```sh
npm run tracker -- search <words>
npm run tracker -- create --title "<title>" --body-file <file> --label ui
npm run tracker -- get <key>
```

Bodies come from files, so long text never passes through a shell, and every write is read back.
Repro steps write `<base_url>` instead of an environment's host.

## Adding a tool

Write `scripts/tm/adapters/<tool>/index.mjs` exporting `createAdapter(options, context)`, register
it in `scripts/tm/adapters/index.mjs`, and run `describeAdapterContract` from
`scripts/tm/contract.mjs` against it or a faithful fake of its API.

### TestRail

Not implemented. A TestRail adapter is definitions first: cases map to TestRail cases through a
custom field holding the identity, runs to TestRail runs, and results to `add_results_for_cases`;
read back each with `get_case` and `get_results_for_run`.
