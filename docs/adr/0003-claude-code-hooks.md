# 0003 - Three Claude Code hooks in exec form

**Status:** Accepted (2026-10-24)

## Context

A Claude Code hook starts a process for every event it matches, so each extra hook is paid on every
tool call. Secret checks spread over several hooks repeat their patterns, and a hook started through
a shell depends on that shell working on every machine; on Windows, endpoint-security software can
turn a shell-based hook into a timeout on every call.

## Decision

Three hooks, Node ES modules registered in exec form (`command: node` plus `args`), with no shell:

| Hook | Events | Job |
|---|---|---|
| `secret-guard.mjs` | prompt, before and after every tool | credentials in prompts and tool calls, secret files, network calls that carry secrets, masking in output; every pattern in `lib/secrets.mjs` |
| `git-policy.mjs` | before `Bash` and `PowerShell` | commit and pull-request rules from qa-config (`tracker`, `policies`), each off until configured |
| `session-probe.mjs` | session start | setup state and whether each pack's application accepts connections; coverage totals once the coverage report exists |

A hook that cannot read what it must check says so with ask or deny; it never reports a pass. Each
hook has table-driven tests that include calls which must be let through.

## Consequences

- One security process per tool call.
- Teams opt in to tracker keys, conventional subjects, protected branches and pull-request labels
  through configuration.
- `session-probe` grows with the packs: the check of each pack's login page arrives with the first
  pack (CORE-14).
