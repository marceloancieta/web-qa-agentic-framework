# Adding an app pack

Each application under test is a pack in `apps/<pack>/`: its manifest, its configuration per
environment, its pages and specs, and a skill with what its pages do not show. The core never
imports a pack, so a new application needs no change outside its folder, its qa-config entry and its
skill. What a pack holds, and which pack and environment a session works on, is in the
[app-packs rule](../../.claude/rules/app-packs.md); this guide walks through creating one.

## 1. Check you may test it

Only test an application you are authorised to test, in the environments qa-config names, and never
production. A public demo is tested read-only unless its owner says otherwise.

## 2. Plan the skeleton

```sh
npm run scaffold:app -- --name <pack> --base-url <url> --title "<Title>"
```

It writes nothing yet. It prints the files it would create and the qa-config entry to add. Further
options set the version, the test id attribute of the application and the login path; the full
usage is at the top of [`scripts/scaffold-app.mjs`](../../scripts/scaffold-app.mjs).

## 3. Write it

```sh
npm run scaffold:app -- --name <pack> --base-url <url> --title "<Title>" --write
```

It refuses when `apps/<pack>/` or the pack's skill already exists: a pack is never overwritten, and
another pack is never copied by hand, since facts about that application would come along and be
wrong. The skeleton runs at once: anonymous only, a home page object and a smoke spec under the page
health guard, and the skill `.claude/skills/<pack>-ui/SKILL.md` from
[the pack skill template](../templates/pack-skill.md).

## 4. Configure it

1. Add the printed entry under `app.environments.<env>.packs` in `qa-config.json` (and in
   `qa-config.example.json` when the pack ships with the repository). Set `allow_writes` to `false`
   for an application whose shared data a test must not change, and give a local application a
   `recovery` if destructive cases will run against it.
2. Fill in `apps/<pack>/app.json`: the breakpoints the layout changes at, the third-party hosts to
   block, the cookies every context starts with (consent banners, a fixed language), the keys and
   fields to redact, and where the app map starts.
3. Add the pack's actors. An actor with an existing account reads its user name and password from
   the variables its qa-config entry names; add those names to `.env.example`, with where their
   values come from, and the values to your `.env`. An actor whose accounts are created during the
   run needs an API client in `apps/<pack>/api/`.
4. Run `npm run config:check`, then the preflight:

   ```sh
   npx playwright test --project='<pack>-*' --grep @smoke
   ```

   The `preflight-<pack>` project names a missing variable or an application that does not answer
   before any case runs.
5. Optionally, give the pack performance budgets in an environment (`performance` in its entry)
   and a `specs/perf/web-vitals.spec.ts` that visits its main pages through their page objects, as
   Juice Shop's does; the web vitals and Lighthouse lanes then cover it
   ([ADR 0012](../adr/0012-performance-lanes.md)). On a host someone else runs, keep the routes
   and runs few.

## 5. Map it

```sh
npm run app:map -- --pack <pack> --write
npm run app:map -- --pack <pack> --actor <role> --write   # signed in, after a run wrote the role's state
```

The walk only reads: it aborts every request that is not a `GET`, `HEAD` or `OPTIONS` and never
leaves the application's origin. The map, `apps/<pack>/docs/app-map.json`, is tracked, so a change in
the application shows up as a diff, and it is the structural source of intake. Once the pack has an
entry in the `ci` environment, the weekly [app map drift](running-tests.md#app-map-drift) check
compares it with the live application. Once a map exists,
the accessibility lane sweeps its routes.

## 6. Take a feature through the phases

From here the pack grows feature by feature: intake, design, automate, publish and run, each at its
own review gate. [Working with Claude Code](working-with-claude-code.md) shows how, and the
[Juice Shop pack](../../apps/juice-shop/README.md) is the worked example of every part.
