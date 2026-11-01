# Working with Claude Code

The process runs in Claude Code: each phase is a skill, the guardrails are rules that load by
themselves, hooks enforce what must never happen, and agents take self-contained reviews. The lists
of skills, agents, rules and hooks, and when to use a skill or an agent, are in
[`CLAUDE.md`](../../CLAUDE.md); this guide shows them at work on one feature.

## Before the first request

- **The session probe.** A session starts by reporting the configuration in effect, whether
  dependencies are installed, and whether each pack's application answers. If an application is
  down, start it (`npm run juice-shop:up`) or check the network before asking for a phase: a phase
  never designs from a story or an old screenshot instead of the application
  ([reachability](../../.claude/rules/reachability.md)).
- **Credentials stay out of the conversation.** `secret-guard` refuses a prompt or a tool call that
  carries a credential and masks credentials in output. Put them in `.env`; the agent reads the
  variable names, never the values ([hooks](../../.claude/hooks/README.md)).
- **Say which pack.** With more than one pack configured, name it, or the skill asks.

## One feature through the five phases

Take the contact form of Juice Shop. Each request below starts one phase, and each phase ends with
the skill showing what it produced and waiting for you. Nothing moves to the next phase until you
approve it; to skip a gate, say so for that step.

| You ask | Skill | You review |
|---|---|---|
| "Intake the contact form of juice-shop." | [`qa-intake`](../../.claude/skills/qa-intake/SKILL.md) | the feature contract: business rules with their source, states, responsive differences and the quality dimensions that apply |
| "Design the cases for the contact form." | [`qa-design`](../../.claude/skills/qa-design/SKILL.md) | the registry: each case with its id, the rule it cites, its technique, priority, tags and devices |
| "Automate the approved contact cases." | [`qa-automate`](../../.claude/skills/qa-automate/SKILL.md) | the specs and page objects, their runs on every device of the environment, the review by `ui-spec-reviewer` and any visual baselines |
| "Publish the contact cases." | [`qa-publish`](../../.claude/skills/qa-publish/SKILL.md) | the definitions in the test-management tool, read back |
| "Run the contact cases and report." | [`qa-run`](../../.claude/skills/qa-run/SKILL.md) | the run: every pass, failure and skip explained, and the report sent |

Design and execution never mix. Intake and design read the application and sign in through the
pack's login, but submit no forms; only a spec run writes, with the data it creates. A run never
edits a spec, a registry or a baseline because of what it showed: a failure becomes a report, and the
report leads to a design change, a defect or a known gap through its own phase
([modes](../../.claude/rules/modes.md)).

## When the application disagrees

When a run, a page or an exploration note disagrees with the contract, ask the
`behaviour-investigator` agent to look at the live pages read-only and classify the disagreement:
contract gap, defect candidate, test error or undetermined. A defect goes through
[`qa-report-bug`](../../.claude/skills/qa-report-bug/SKILL.md): a triage you approve, a search for
an issue that already covers it, the issue filed and read back, and the affected cases mapped to its
key. Nothing is filed without your approval.

## Committing the work

`git-policy` applies the commit rules qa-config turns on: the convention of
[ADR 0006](../adr/0006-branching-and-traceability.md), `type(scope): <BACKLOG-ID> summary`, and the
protected branches. The `pre-push` hook runs `npm run gates`. Pushing and publishing anything
outside the machine need your approval.

## Getting good results

- Ask for one phase at a time, and read its artifact before approving: a gate is where a wrong rule
  or a missing case is cheapest to fix.
- Give intake every source you have: a story, an issue, manual exploration notes. Each rule in the
  contract cites where it came from.
- A case that cannot be automated as designed goes back to design rather than being changed while
  it is coded: its spec is removed before the gate and its row stays `approved`. A spec that passes
  only sometimes is not done.
- Keep the pack's skill current. When a session learns something about the application that the app
  map does not show, it belongs in `.claude/skills/<pack>-ui/SKILL.md` or the pack's
  `docs/app-notes.md`.
