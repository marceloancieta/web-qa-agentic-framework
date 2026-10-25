---
name: qa-report-bug
description: >-
  Files a defect of a web application under test in the configured tracker after a triage the user
  approves: test error or defect, confirmed or not, severity, siblings, and a search for an issue
  that already covers it. Writes the description to a file, files or comments through npm run
  tracker, reads it back, and maps the affected cases to the key. Use when the user asks to report,
  file or log a bug, or when a run, a page or an exploration note disagrees with the contract and
  someone has to decide whether it is a defect. Never files without the user's approval.
---

# qa-report-bug: triage and file

Follows either mode. It writes to the tracker, never to the application. Commands and providers
are in [test management](../../../docs/test-management.md#trackers).

## Triage, in this order

1. **Test error or defect?** Check the locator against the live page, the data the case used, the
   expected result against the contract, the device project, and data left by earlier runs. A red
   test is not yet a defect. A locator that stopped matching after a change of the page is a test
   change, through `qa-automate`.
2. **Confirmed?** Reproduced on the test environment with its evidence (trace, a screenshot with
   sensitive fields masked, the axe result, the visual diff) is a defect. Seen once, or only in a
   note, is an unconfirmed finding until reproduced. Unsure whether the behaviour is wrong at all is
   a question for the owner.
3. **Severity**:
   - `S1` blocks a critical path for everyone (signing in, the main task of the feature) or exposes
     data or a session.
   - `S2` breaks a feature or a dimension for a group of users: one device class, keyboard or
     screen-reader users (a WCAG A or AA failure on a main path), one role.
   - `S3` a wrong state, message or layout with a way around it.
   - `S4` cosmetic, with no effect on the task.
4. **Siblings**: the same component on other routes, the other device projects, the other roles.
   Check them; what they show decides how wide the issue is.
5. **One issue or a comment?** Search at the width the fix would have:
   `npm run tracker -- search <words> --open`, once per distinctive term (the route, the message,
   the component), then read each candidate with `npm run tracker -- get <KEY>`. Repeat without
   `--open` for a closed issue the finding reopens. A finding that falls within the scope of an open
   issue becomes a comment on it.

Propose the outcome before writing anything: new issue or comment, title, severity, devices, and the
cases affected. Wait for approval.

## Filing

1. Write the description to a file in the scratchpad: what happens, what should happen and the
   source that says so (the contract rule), the steps with `<base_url>` for the host, the devices
   and browsers, the evidence. Keep it short; the detail goes into a separate file, posted as the
   first comment.
2. File it, or comment on the issue found in step 5:
   ```sh
   npm run tracker -- create --title "<title>" --body-file <file> --label ui --label severity:<S1-S4>
   npm run tracker -- comment <KEY> --body-file <file>
   ```
   An unconfirmed finding ends its title with `(unconfirmed)`, takes the label
   `type:unconfirmed-finding` instead of a severity, and proposes the severity in its text. The
   wrapper reads every write back.
3. The wrapper sends text only. Name the evidence in the body (the trace, the screenshot, the axe
   result, the visual diff) with the run id that holds it; a file that leaves the machine is
   redacted, and a trace or HAR only after the secret scan passed on it.
4. **Map the cases**: each affected case cites the key in the registry Defect column, and a case
   that still runs arms `knownGap('<KEY>', why)` with `@known-gap` (through `qa-automate`, since
   that is a spec change). The status does not change; `blocked` means the case has no way to
   execute.
5. Report the key, its link, the evidence it names and which cases cite it.

## If it stops halfway

An issue without its comment or its case mapping is finished, not repeated: comment on the same key
and map the cases. When an issue is closed as a duplicate, move the cases that cite it to the
remaining key in one change.

## Do not

- File without the triage and the user's approval, or file as a defect what has not been reproduced.
- File a new issue for a cause an open one already covers.
- Put a token, a password, a real account or an unmasked screenshot into the tracker.
