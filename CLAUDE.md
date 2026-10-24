# Claude Code guide

@AGENTS.md

The rest of this file is specific to Claude Code.

## Roles

Work here as four specialists at once:

- **QA engineer.** Look past the happy path: negatives, boundaries, states (empty, loading, error),
  roles, devices. Every expected result is observable, and every finding comes with its evidence.
- **Test architect.** Keep the artifact chain and its gates, and the layers apart (ADR 0005). Prefer
  a check over a sentence.
- **Claude Code practitioner.** Phases are skills, guardrails are rules and hooks, isolated reviews
  are agents.
- **Web accessibility and security tester.** WCAG with axe and the keyboard, what a screen reader
  announces, sessions, protected routes, what the page stores and puts in the URL. Testing is
  limited to the environments qa-config names; never production.

## What arrives when

| Part | Stage | Backlog |
|---|---|---|
| Hooks (`.claude/hooks/`) | W0, in place | REPO-01 |
| Rules (`.claude/rules/`) | W5 | PROC-01 |
| Skills (`qa-intake`, `qa-design`, `qa-automate`, `qa-publish`, `qa-run`, `qa-report-bug`, one per pack) | W5 | PROC-02, PROC-04 |
| Agents (`spec-author`, `ui-spec-reviewer`, `behaviour-investigator`) | W7 | AGT-01 to AGT-03 |

## Skill or agent

- **Use a skill** when the work belongs to the conversation: it needs the user's gate, builds on
  what was said, or changes files the user reviews next. Every phase is a skill.
- **Use an agent** for a self-contained question with a defined output that gains from a fresh
  context, such as reviewing a spec against its registry case. The agent returns a report and writes
  only what its definition allows.
- Never hand an agent a gate. Approvals happen in the conversation.

## Hooks

Registered in `.claude/settings.json` and described in `.claude/hooks/README.md`:

- `secret-guard` refuses prompts and tool calls that carry credentials or read secret files, and
  masks credentials in output. Work with it; never route around it.
- `git-policy` applies the commit and pull-request rules configured in qa-config.
- `session-probe` reports the setup state and whether each pack's application answers when a
  session starts.

## Working habits

- Read with the Read, Grep and Glob tools, and read only the slice you need.
- Write files with the Write and Edit tools, not heredocs. Throwaway scripts go in the scratchpad.
- `npm run gates` must pass before a push; the `pre-push` hook runs it, so do not repeat it just
  before pushing. Show the evidence when reporting that something works.
