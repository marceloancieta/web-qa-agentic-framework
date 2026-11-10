---
name: spree-ui
description: Facts about Spree Commerce admin that the app map does not show - sessions, page behaviour, limits. Read before designing, automating or running cases of the spree pack.
---

# Spree Commerce admin

<One paragraph: what the application is, where it runs (local container or public site), whether
writes are allowed in each environment, and what the pack demonstrates.>

## Before you start

- Reachability: <how to start it, or what to check when it does not answer>.
- Configuration: the pack's entry under `app.environments.<env>.packs.spree` in qa-config.
- The pack's map: `apps/spree/README.md`; the app map: `apps/spree/docs/app-map.json`.

## Sessions

| Role | Account | How it signs in | What the session leaves behind |
|---|---|---|---|
| `anonymous` | none | a fresh context | |
| `<role>` | <provisioned per worker, or existing from the environment> | <API call, or the form> | <storage keys, cookies> |

## Application notes

Read `apps/spree/docs/app-notes.md` before designing: it holds what the application does that its
pages do not show, each fact with how it was observed. This skill does not repeat those facts; it
says what they change for each phase below.

## Devices

<Breakpoints from `app.json`, and what changes at each one.>

## What each phase must know

- Intake and design: <how to read the pages without writing: which actor's state to map with, what
  a design session must not touch>.
- Automate: <what the specs must do because of the application: data they create and cannot remove,
  cookies every context sets, waits that are needed>.
- Run: <recovery after destructive cases, what a run leaves behind>.

## Known defects

| Key | What | Cases armed with it |
|---|---|---|

## Accessibility baseline

<Where `a11y-known.json` stands and the main known violations, each with its key.>
