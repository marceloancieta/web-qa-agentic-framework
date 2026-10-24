# 0008 - Configuration per app pack and per environment

**Status:** Accepted (2026-10-24)

## Context

The framework tests several applications at once (Juice Shop and SauceDemo in v0.1), each in more
than one place: a local container, a CI service, a public demo. A UI run adds a dimension an API
run lacks: the browsers and devices it covers. And the same role (a customer, an administrator)
needs a signed-in browser, which some applications let a test create through their API and others
only offer as fixed demo accounts.

Settings that change between environments must not be mixed with facts about the application that
never change, and nothing that identifies an account may live in a tracked file.

## Decision

Two files, split by what changes.

- **`apps/<pack>/app.json`** (tracked): what the application is. Name, version (part of every case
  identity), title, `testIdAttribute`, layout `breakpoints`, `third_party_hosts` the mocks block,
  extra `secret_keys` and `identity_fields` for redaction, and `workers` when the application cannot
  take concurrent sessions.
- **`qa-config`** (`qa-config.json` per machine, ignored by git; the tracked example otherwise):
  where it runs. `app.environments.<env>` lists the device `projects` that environment runs and one
  entry per pack it serves: `base_url`, `allow_writes`, `recovery`, and the `actors`. There is no
  global fallback: a pack the environment does not configure fails its preflight with the reason.
  `QA_ENV` picks the environment and `QA_<PACK>_BASE_URL` overrides one URL for one run.

**Actors say where an account comes from, not how a session is opened.** An actor is either
`provisioned` (the pack creates a fresh account per worker through its API, which needs
`allow_writes`) or `existing` (a username and a password read from variables named in the entry).
Opening the session (an API login whose token goes to local storage, an injected cookie) is the
pack's own code, because it is the same in every environment. `anonymous` is built in.

**Projects are `<pack>-<device>`,** built in `playwright.config.ts` from the core device catalog
(`helpers/devices.ts`) and the environment's list, each after a `preflight-<pack>` project that
names the missing variables and checks that the application answers. Each device project filters
cases by its form factor (`@desktop-only`, `@mobile-only`) and leaves out what only a lane runs
(`@destructive`, `@quarantine`, `@visual`), with one filter in `scripts/lib/tags.mjs`.

`npm run config:check` validates qa-config against `schemas/qa-config.schema.json` and the rules
that span fields (recovery and provisioned accounts need writes, the default actor exists, quality
gate bands point the right way).

## Consequences

- A new pack runs on every device of the environment without editing the runner configuration.
- `--project=juice-shop-*` selects one pack and `--project=*-mobile-chrome` one device.
- The example keeps `policies.commit.protected_branches` empty while the repository is built with
  local commits on `main` (ADR 0006); it becomes `["main"]` with the first push.
