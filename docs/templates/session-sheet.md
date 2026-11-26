# Session sheet template

The sheet of one chartered exploratory session (ADR 0013), at
`apps/<pack>/docs/sessions/<yyyy-mm-dd>-<slug>.md`. Its front matter is the charter: `npm run
explore -- open <sheet>` reads it before it starts the session's browser, and refuses a charter that
does not fit the configuration. The body records what the session saw, and the debrief reviews it.
`scripts/lib/session-sheet.mjs` owns the format, and `lint-docs` (rule `session-sheet`) checks every
sheet against it.

One sheet holds one session. A session that needs more time, another role or a lead outside its
mission gets a charter of its own; the lead goes under **Proposed charters**, not into this one.

## The charter

| Key | Holds |
|---|---|
| `mission` | what the session looks for, in one sentence |
| `pack` | the pack whose folder holds the sheet |
| `environment` | a qa-config environment, the one `QA_ENV` selects when the session opens; never one named like production |
| `routes` | the routes the session starts from; the browser opens on the first |
| `role` | one actor of the pack in that environment, signed in from the newest state a spec run wrote, or `anonymous` |
| `device` | a device project that runs on Chromium, since an agent attaches over CDP |
| `driver` | `person`, `agent` or `both` |
| `writes` | `none`: every request that is not GET, HEAD or OPTIONS is stopped in the browser. `allowed`: the session runs on a disposable copy, the service `<pack>-explore` of `docker/compose.yml`, started fresh for it and removed when it ends; it needs `allow_writes: true`, and its role is `anonymous`, since the copy starts empty |
| `out_of_bounds` | what the session leaves alone, as a list; `[]` when nothing is |
| `minutes` | the time box: a person 60 by default and 90 at most, an agent or both 30 by default and 60 at most |

`explore open` adds `opened`, and `explore close` adds `closed` and `ended` (`closed`, `time box`,
`window closed` or `interrupted`).

## The body

- **Findings.** One `###` heading per finding, then its items: **Steps** (with `<base_url>`, never
  a host), **Expected**, **Seen**, **Device**, **Role**, **Reproduced** (how many times out of how
  many tries) and **Evidence**, a file under `reports/explore/<session>/` with the time in it where
  that helps. `None.` when there are none.
- **Questions.** What the session could not settle. A finding without evidence is a question.
- **Proposed charters.** Leads outside this mission.
- **Data created.** Required in a writing session: what it created, which goes with the copy.

At the debrief each finding leaves through its own phase: a contract gap to `qa-intake`, which takes
the sheet as exploration notes, a disagreement to `qa-report-bug`, a question to a
`behaviour-investigator`. The session itself files nothing.

## Example

```markdown
---
mission: Find where the cart badge and the cart page disagree
pack: saucedemo
environment: local
routes:
  - /inventory.html
role: standard
device: desktop-chromium
driver: agent
writes: none
out_of_bounds:
  - the checkout forms
minutes: 30
---

# Cart badge and cart page

## Findings

### F1. The badge keeps a removed item until the next page

- Steps: open `<base_url>/inventory.html`, add two products, open the cart, remove one
- Expected: the badge shows 1
- Seen: the badge shows 2 until another page loads
- Device: desktop-chromium
- Role: standard
- Reproduced: 2 of 2
- Evidence: `reports/explore/2026-11-26-cart-badge/trace-01.zip`, at 00:04

## Questions

- Does the badge read the cart from local storage or from the page?

## Proposed charters

- The badge across two tabs of the same session.
```
