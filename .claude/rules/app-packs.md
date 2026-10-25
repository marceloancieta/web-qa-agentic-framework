---
paths:
  - 'apps/**'
  - '.claude/skills/**'
  - 'qa-config*.json'
---

# App packs

Each application under test is a pack in `apps/<name>/`. The core (`helpers/`, `fixtures/`,
`scripts/`) never imports from a pack; `npm run lint:layers` (core-imports-pack) reports an import
that does. ADR 0005 gives the layers, ADR 0008 the configuration.

## Which pack, which environment

- **The pack** comes from the request: the user names the application, or the routes belong to
  exactly one pack. When more than one could match, ask.
- **The environment** is `QA_ENV` when set, otherwise `app.default_environment` in qa-config. Its
  `projects` list the device projects it runs, and its `packs.<pack>` entry holds the pack's
  `base_url`, `allow_writes`, `recovery`, `actors` and `default_actor`. A pack without an entry in
  the environment cannot run there; there is no global fallback. `qa-config.json` belongs to one
  machine; without it, `qa-config.example.json` applies.
- **Accounts** are named by the pack's `actors`: `provisioned` accounts are created during the run
  through the pack's API, one per worker; `existing` accounts name the variables that hold their
  user and password. Values come from the environment, never from the config file.
- **Run one pack** with `npx playwright test --project='<pack>-*'`, one device of every pack with
  `--project='*-<device>'`.

## What a pack holds

| Path | Holds |
|---|---|
| `app.json` | name and version (part of every case identity), title, `login_path`, `testIdAttribute`, `breakpoints`, `third_party_hosts`, `secret_keys` and `identity_fields` for redaction, `workers`, `visual` settings, `cookies` every context starts with (banners, language; never a session), `app_map` routes, with the routes only a role reaches under `app_map.actors`; checked by `loadAppPack` (`helpers/app-pack.ts`) whenever Playwright loads its configuration, so every run and `npm run gates` refuse a broken one |
| `README.md` | the map of the pack: how to run it, its sessions, its layout, facts about the application |
| `fixtures.ts` | the pack's `test`: `createTest(provider)` with its way of creating and signing in accounts, plus one fixture per role |
| `api/` | thin clients over `APIRequestContext` that prepare and verify state |
| `builders/` | data: accounts, products, texts at the boundaries; unique per run |
| `pages/`, `components/` | page objects; locate and act, never assert |
| `flows/` | business tasks used by two or more specs |
| `mocks/` | the pack's network handlers, over the core `helpers/network.ts` |
| `rules/` | decision tables as YAML |
| `specs/` | Playwright specs |
| `visual/` | visual baselines, one folder per device project, rendered only in the pinned container |
| `a11y-known.json` | known accessibility violations, each with a tracker key and an expiry |
| `docs/app-map.json` | the app map (`npm run app:map -- --pack <pack> --write`); tracked, never edited by hand. `docs/app-map.<role>.json` is the same walk signed in as a role (`--actor <role>`) |
| `docs/features/` | feature contracts written at intake |
| `docs/app-notes.md` | where the application behaves differently from what its pages suggest, with status; repro steps write `<base_url>` (`lint-docs` host-in-notes) |
| `registry/` | designed cases (`.claude/rules/registry.md`) |

The pack's skill (`.claude/skills/<name>-ui/SKILL.md`, from
[the pack skill template](../../docs/templates/pack-skill.md)) records what an agent needs to know
about the application that the app map does not show.

## A new pack

`npm run scaffold:app -- --name <pack> --base-url <url>` prints the files it would write and the
qa-config entry to add; `--write` writes them and refuses when the pack or its skill already exists.
The skeleton runs at once: anonymous only, a home page object and a smoke spec under the page health
guard. The pack's skill starts as the template's example with the pack's name and title, and intake
fills its placeholders.
Never copy another pack by hand: facts about that application would come along and be wrong.
