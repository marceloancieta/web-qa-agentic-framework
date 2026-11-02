# Running tests

How to choose what runs, where it runs and what it leaves behind. The `qa-run` skill does all of this
in a session, with a data gate before the run and every result explained after it
([`qa-run`](../../.claude/skills/qa-run/SKILL.md)); this guide is the same ground by hand.

## Choosing the environment

`QA_ENV` (or `app.default_environment` in qa-config) picks an environment. An environment names the
packs it runs, their base URLs, whether they allow writes, how each one recovers, and the device
projects ([ADR 0008](../adr/0008-per-pack-configuration.md)). The example configuration has
`local`, with both packs, and `ci`, with Juice Shop on every device.

To point one pack at another address for a single run, set `QA_<PACK>_BASE_URL`, the pack's name in
capitals with hyphens as underscores:

```sh
QA_JUICE_SHOP_BASE_URL=http://localhost:3001 npx playwright test --project='juice-shop-*'
```

## Choosing projects and cases

Projects are named `<pack>-<device>`; the devices are defined in
[`helpers/devices.ts`](../../helpers/devices.ts) and each environment picks its own. A `unit` project
runs the core's own tests.

```sh
npx playwright test --project='juice-shop-*'                       # one pack, every device
npx playwright test --project=juice-shop-mobile-chrome             # one pack, one device
npx playwright test --project='juice-shop-*' --grep @smoke         # by tag
npx playwright test --project='juice-shop-*' --grep TC-LOGIN-03    # one case by its id
npx playwright test apps/juice-shop/specs/basket/                  # one feature's specs
```

Every case carries a layer tag, the tags of the quality dimensions it covers and its handling tags
(`@desktop-only`, `@mocked`, `@known-gap`, `@destructive` and others). Their meaning, and what each
project leaves out, is in the [tagging rule](../../.claude/rules/tagging.md).

## Watching a run

```sh
QA_SLOWMO=800 npx playwright test --project=juice-shop-desktop-chromium --headed --workers=1
npx playwright test --project=juice-shop-desktop-chromium --debug    # step through with the inspector
npx playwright test --project=juice-shop-desktop-chromium --ui       # replay action by action
```

`QA_SLOWMO` is the wait before each action, in milliseconds; the test timeout grows with it.

## Lanes

A lane runs one kind of case with what that kind needs before and after it. Each one takes the usual
Playwright options (`--project`, a spec file, a narrower `--grep`) and writes its report to
`reports/lanes/<lane>.json`.

| Lane | Runs | Notes |
|---|---|---|
| `npm run lanes:visual` | the `@visual` cases | in the pinned Playwright container, so screenshots match the baselines; it refuses `--update-snapshots` ([ADR 0009](../adr/0009-container-lanes.md)) |
| `npm run lanes:a11y` | an accessibility sweep over every route of the app maps, per role | new violations fail; known ones are in the pack's `a11y-known.json` with a tracker key and an expiry |
| `npm run lanes:mocked` | the `@mocked` cases | answers come from route mocks, not the application |
| `npm run lanes:known-gap` | the `@known-gap` cases | then a summary of which gaps still fail as armed and which now pass |
| `npm run lanes:destructive` | the `@destructive` cases | one worker, then each selected pack's recovery; refused for a pack without one |
| `npm run lanes:flake` | the `@quarantine` cases, ten times each, without retries | weekly in CI |

How each lane is built is described at the top of [`scripts/lanes.mjs`](../../scripts/lanes.mjs).

Baselines are design, not execution: only the automate phase rewrites them, with
`npm run lanes:visual -- --phase automate --update`, and the diff images are shown at its gate.

## Reports

| Output | Where | Open it with |
|---|---|---|
| HTML report | `playwright-report/` | `npx playwright show-report` |
| Allure results | `allure-results/` | `npm run report:html`, then `reports/allure-report/index.html` |
| JSON report for the quality gate | `reports/playwright.json` | `npm run quality:gate` |
| Traces and screenshots of failures | `test-results/` | the HTML report, or `npx playwright show-trace <trace.zip>` |

Every artifact is redacted after the run: the run's secrets are removed from traces, the HTML
report and the Allure results by the last reporter.

The quality gate gives a run one verdict, PASS, REVIEW or FAIL, from the pass rate, new
accessibility violations by impact and failed visual cases; its thresholds are qa-config
`quality_gate`. `npm run tm:report` sends a run's results to the configured test-management tool
([test management](../test-management.md)).

## Mutation testing

`npm run mutation` measures how well the unit tests of the framework's own libraries
(`scripts/lib` and `.claude/hooks/lib`) catch a change: Stryker changes one expression at a time,
runs the `node:test` suites against it, and counts the changes no test noticed. It takes about half
an hour, so it runs on demand and never inside `npm run gates`. There is one run per library, each
writing an HTML report (each surviving mutant, in its source) and a JSON report under
`reports/mutation/`: `scripts-lib` and `hooks-lib`. The quality gate then judges both JSON reports
as one score against qa-config `quality_gate.mutation` (verdict in
`reports/mutation/quality-gate.md`). To judge the reports again without running Stryker:

```sh
npm run mutation:gate
```

Settings are in [`stryker.config.mjs`](../../stryker.config.mjs), which also says why the hooks
library runs differently ([`stryker.hooks.config.mjs`](../../stryker.hooks.config.mjs)). The suites
that open a browser need the Playwright browsers installed, as for `npm run gates`.

## Sharding, as CI does

```sh
QA_BLOB_REPORT=1 npx playwright test --project='juice-shop-*' --shard=1/4
# ... the other shards, then:
npm run ci:merge
npm run quality:gate -- --report reports/playwright.json --report reports/lanes/a11y.json
```

One `QA_RUN_ID` covers the shards, the lanes, the quality gate and the report; the gate refuses a
report of another run. The workflow in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
is the reference.
