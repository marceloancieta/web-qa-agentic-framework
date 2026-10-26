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
| Rules (`.claude/rules/`) and templates (`docs/templates/`) | W5, in place | PROC-01, PROC-03 |
| Skills (`.claude/skills/`) | W5, in place | PROC-02, PROC-04 |
| Agents (`.claude/agents/`) | W7, in place | AGT-01 to AGT-03 |

## Skill or agent

- **Use a skill** when the work belongs to the conversation: it needs the user's gate, builds on
  what was said, or changes files the user reviews next. Every phase is a skill.
- **Use an agent** for a self-contained question with a defined output that gains from a fresh
  context, such as reviewing a spec against its registry case. The agent returns a report and writes
  only what its definition allows.
- Never hand an agent a gate. Approvals happen in the conversation.

## Agents

In `.claude/agents/`. Each one declares its tools, and one that writes nothing has no tool that
edits files (`scripts/__tests__/agent-guide.test.mjs`).

| Agent | Use it to | Writes |
|---|---|---|
| [`spec-author`](.claude/agents/spec-author.md) | write the specs of an assigned set of approved cases, run them on the device projects and report per case | the spec files it is assigned |
| [`ui-spec-reviewer`](.claude/agents/ui-spec-reviewer.md) | review a spec and its page objects against the registry cases: title claim, oracles, coincidence, locators, waits, layers | nothing |
| [`behaviour-investigator`](.claude/agents/behaviour-investigator.md) | investigate one requirement against what the live pages do, read-only | throwaway probe scripts in the scratchpad |

A change to `ui-spec-reviewer` is measured against its evaluation fixtures,
[`scripts/__fixtures__/agents/ui-spec-reviewer/`](scripts/__fixtures__/agents/ui-spec-reviewer/README.md):
seeded defects, look-alikes and the expected report.

## Skills

In `.claude/skills/`. One per phase, each ending at its review gate, plus one per pack.

| Skill | Phase | Mode | Produces |
|---|---|---|---|
| [`qa-intake`](.claude/skills/qa-intake/SKILL.md) | 0 intake | design | the feature contract |
| [`qa-design`](.claude/skills/qa-design/SKILL.md) | 1 design | design | the registry of reviewed cases |
| [`qa-automate`](.claude/skills/qa-automate/SKILL.md) | 2 automate | design | specs and their building blocks, visual baselines, rows `automated` |
| [`qa-publish`](.claude/skills/qa-publish/SKILL.md) | 3 publish | design | case definitions in test management, rows `published` |
| [`qa-run`](.claude/skills/qa-run/SKILL.md) | 4 run | execution | a reported run |
| [`qa-report-bug`](.claude/skills/qa-report-bug/SKILL.md) | defects | either | a triaged issue in the tracker, cases mapped to it |
| [`juice-shop-ui`](.claude/skills/juice-shop-ui/SKILL.md) | every phase | either | what the Juice Shop app map does not show |

A new pack gets its skill from `npm run scaffold:app`, written from
[the pack skill template](docs/templates/pack-skill.md).

## Rules

In `.claude/rules/`. `modes` and `reachability` always load; the others load with the files they
govern.

| Rule | Covers |
|---|---|
| [`modes`](.claude/rules/modes.md) | design versus execution, what counts as reading, the gates |
| [`reachability`](.claude/rules/reachability.md) | stopping when a system does not answer, never substituting |
| [`app-packs`](.claude/rules/app-packs.md) | which pack and environment, what a pack holds, a new pack |
| [`registry`](.claude/rules/registry.md) | case ids, the registry format, the cited status of contract rules, statuses |
| [`generation`](.claude/rules/generation.md) | from an approved case to a spec: layers, locators, every case, data |
| [`tagging`](.claude/rules/tagging.md) | layer, dimension and handling tags |
| [`reporting`](.claude/rules/reporting.md) | identity, what a result holds, runs |
| [`documentation`](.claude/rules/documentation.md) | one home per fact, reachable files, propagation |

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
