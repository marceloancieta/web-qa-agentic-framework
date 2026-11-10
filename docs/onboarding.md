# Onboarding

From a fresh clone to a first run, a first report and a first phase. Each step says what you should
see; the last section covers what most often stops a first run.

## 1. Requirements

| Tool | Why |
|---|---|
| Node, at the version `engines` in [`package.json`](../package.json) names | the scripts, the linters and Playwright |
| [Docker](https://docs.docker.com/get-docker/) | Juice Shop runs in a container, and so does the visual lane |
| [gitleaks](https://github.com/gitleaks/gitleaks#installing), at the version `GITLEAKS_VERSION` in [the CI workflow](../.github/workflows/ci.yml) names | the secret scan of the commit hook and the gates; without it they fail closed |
| [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) | the phases, from intake to run |

## 2. Install

```sh
npm ci
npx playwright install chromium
npm run hooks:install
```

- `npx playwright install` downloads the browsers of the Playwright version in the lockfile. Add
  `firefox webkit` for the other desktop projects; `npm run ci:browsers` installs all three with
  their system packages, as CI does.
- `hooks:install` points git at [`.githooks/`](../.githooks/pre-commit): the secret scan and the
  denylist before each commit, the denylist and the public wording on each commit message, and
  `npm run gates` before each push.

## 3. Configure

```sh
cp .env.example .env
cp qa-config.example.json qa-config.json   # optional: without it, the example is in effect
```

- `.env` holds credentials and per-run settings. [`.env.example`](../.env.example) names each
  variable and where its value comes from; git ignores `.env`, and nothing else in the repository
  may hold a credential.
- `qa-config.json` chooses the environment (`app.default_environment`, or `QA_ENV`), the packs and
  device projects each environment runs, the test-management tool, the tracker, the commit policy
  and the quality gate thresholds. Its schema is
  [`schemas/qa-config.schema.json`](../schemas/qa-config.schema.json); `npm run config:check`
  validates it.
- A local denylist of terms that must never be published (client names, internal hosts) goes in
  `.git/info/denylist`, one regular expression per line. It lives inside the git directory, so it
  can never be committed.

## 4. A first run

```sh
npm run juice-shop:up
npx playwright test --project='juice-shop-*' --grep @smoke
npx playwright show-report
```

- `juice-shop:up` starts the container and waits until it is healthy; `juice-shop:down` removes it,
  and the next start has an empty database.
- The Spree pack runs the same way: set `SPREE_ADMIN_EMAIL` and `SPREE_ADMIN_PASSWORD` in `.env`,
  then `npm run spree:up` starts Spree and its database, makes that admin and loads the sample data;
  `spree:down` removes both. The `local` environment of the example configuration names it, so a
  plain `npm test` expects it to be running.
- A project name is `<pack>-<device>`, such as `juice-shop-desktop-chromium`. The `local`
  environment runs the devices it names in `qa-config`; the full list is in
  [`helpers/devices.ts`](../helpers/devices.ts).
- Each pack starts with a `preflight-<pack>` project that checks the application answers and the
  actors' variables are set, so a missing variable is named before any case starts.
- The HTML report opens in the browser; Allure results are in `allure-results/`
  (`npm run report:html` builds the Allure report).

## 5. The gates

```sh
npm run gates
```

Lint, format, types, configuration, the unit tests of the hooks, scripts and core, the QA linters
with their self-tests, coverage and traceability, the tracker keys the registries cite, and the
scans of the whole history. The
`pre-push` hook runs it, so a push never carries a red gate. [`AGENTS.md`](../AGENTS.md#rules-that-apply-to-every-change)
lists what it checks.

## 6. A first phase with Claude Code

Open Claude Code in the repository. A session starts with a probe that reports the configuration in
effect and whether each pack's application answers. Then ask for intake of a feature, for example
"intake the Juice Shop contact form": the `qa-intake` skill reads the app map and the live pages,
writes the feature contract and stops for your review. Each later phase works the same way.
[Working with Claude Code](guides/working-with-claude-code.md) walks a feature through all five.

## When a first run fails

| What you see | Why | What to do |
|---|---|---|
| `Executable doesn't exist at …/chromium_headless_shell-<n>/…` | the installed browsers belong to another Playwright version | `npx playwright install chromium` (or the project's browser) with the repository's own Playwright |
| `connect ECONNREFUSED 127.0.0.1:3000`, or the preflight says the application does not answer | Juice Shop is not running | `npm run juice-shop:up`; if Docker itself is not running, start it first |
| the preflight names a variable such as `SAUCEDEMO_PASSWORD` | the actor's credential is not in the environment | set it in `.env`; `.env.example` says where the value comes from |
| `secret-scan: gitleaks is not installed, so the secret scan could NOT run` | the secret scan fails closed without its scanner | install gitleaks at the version CI uses |
| a host times out, or a TLS or DNS error | the network, a VPN or a proxy, not the application | check the network first; a timeout is not a defect of the application ([reachability](../.claude/rules/reachability.md)) |
| a `401`, `404` or `500`, or an error on the page | an answer from the application | check the account, the route and the data before the network |
