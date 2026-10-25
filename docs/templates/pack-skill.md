# Pack skill template

The skill of an app pack, at `.claude/skills/<pack>-ui/SKILL.md`. It records what an agent needs to
know about the application that the app map does not show: how its sessions work, where its pages
behave differently from how they look, what it cannot do. The phase skills read it before they
touch the pack. Copy everything below the line and replace the placeholders. Keep it to facts that
were observed, each with how it was observed, and link to the pack's docs instead of repeating them.

---

```markdown
---
name: <pack>-ui
description: Facts about <application title> that the app map does not show - sessions, page behaviour, limits. Read before designing, automating or running cases of the <pack> pack.
---

# <Application title>

<One paragraph: what the application is, where it runs (local container or public site), whether
writes are allowed in each environment, and what the pack demonstrates.>

## Before you start

- Reachability: <how to start it, or what to check when it does not answer>.
- Configuration: the pack's entry under `app.environments.<env>.packs.<pack>` in qa-config.
- The pack's map: `apps/<pack>/README.md`; the app map: `apps/<pack>/docs/app-map.json`.

## Sessions

| Role | Account | How it signs in | What the session leaves behind |
|---|---|---|---|
| `anonymous` | none | a fresh context | |
| `<role>` | <provisioned per worker, or existing from the environment> | <API call, or the form> | <storage keys, cookies> |

## Behaviour the pages do not show

- <A fact, with the route and how it was observed: "after a login through the form the application
  moves to `/#/search` (measured, 2026-10-25, desktop Chromium)".>

## Devices

<Breakpoints from `app.json`, and what changes at each one.>

## Limits

- <What the application cannot do that a case might expect: no endpoint to delete an account, a
  database that empties on restart.>

## Known defects

| Key | What | Cases armed with it |
|---|---|---|

## Accessibility baseline

<Where `a11y-known.json` stands and the main known violations, each with its key.>
```
