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

## Application notes

Read `apps/<pack>/docs/app-notes.md` before designing: it holds what the application does that its
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
```
