# Adopting the framework

How a team starts its own test project from the framework, gets its CI green, and later takes a
newer release. The framework is published as a GitHub template; `npm create web-qa` (FUT-02) makes
the same starting point without GitHub.

## 1. Make the copy

1. On the framework's GitHub page, choose **Use this template**, then **Create a new repository**.
   The copy has the framework's files in a history of its own: one commit, no link to the
   framework's history.
2. Clone the copy, then on the machine:

   ```sh
   npm ci
   npm run ci:browsers      # the three engines; onboarding has a lighter install for one
   npm run hooks:install
   ```

3. Record the release the copy was made from, so a later update knows where it starts. The first
   update does it (`--from` in section 4); until then, the release is the tag the template page
   showed, such as `v0.1.0`.

## 2. Choose the packs

The copy starts with the two example packs. Juice Shop is the worked example: the core's own tests
read it, so it stays. SauceDemo can go:

```sh
npm run remove:app -- --name saucedemo           # prints what it would remove and change
npm run remove:app -- --name saucedemo --write
```

It removes `apps/saucedemo/` and its skill, takes the pack out of every environment of
`qa-config.example.json` (and `qa-config.json`), and drops the table rows that link into the
removed folders. The files that still name the pack are listed: edit them by hand, then run
`npm run gates`. A pack the core reads is refused with the list of files that read it.

Add the team's own applications with `npm run scaffold:app`
([adding an app pack](adding-an-app-pack.md)).

## 3. Get the CI green

1. `npm run gates` passes on the machine first; the `pre-push` hook runs it on every push.
2. The workflows need no secrets: the CI starts Juice Shop in Docker and runs the `ci` environment
   of qa-config. A pack of the team's own needs its URL in the `ci` environment and its accounts as
   repository secrets, read through the variables its actors name (never written in a file).
3. Apply the repository settings the CI relies on: the `required` and `title` checks on `main`,
   squash merges and a linear history. The framework's own settings are a model to start from, not
   a requirement.
4. Push a branch, open a pull request and wait for `required` to pass.

## 4. Take a later release

The framework's releases are tags (`v<x.y.z>`), each with a changelog section. To take one:

```sh
npm run framework:update -- --to v0.2.0 --from v0.1.0      # the first time; later, --to alone
npm run framework:update -- --to v0.2.0 --from v0.1.0 --write
```

Without `--write` it fetches both releases into refs of their own (`refs/web-qa/<tag>`) and prints
the product files that change between them. With `--write` it applies that difference to the
working tree and the index with a three-way merge, so the project's own changes to the same files
stay, and records the release in `.web-qa.json`; commit that file with the update. It refuses a tree
with uncommitted changes and a release that is not later than the recorded one.

What it never touches:

- the framework's development records: its backlog, changelog, decisions (`docs/adr/`), community
  files and repository settings; the project keeps its own;
- the app packs and their skills (`apps/<pack>/`, `.claude/skills/<pack>-ui/`), which are the
  project's.

When the framework and the project changed the same lines, the file is left with conflict markers
and listed; resolve them, `git add` the file, then run `npm ci` if `package-lock.json` changed, and
`npm run gates`. The list of what counts as product is `scripts/lib/product.mjs`.
