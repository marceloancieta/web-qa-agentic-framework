# Security policy

## Reporting a vulnerability

Report a vulnerability of this framework privately, through GitHub's private vulnerability
reporting: the **Security** tab of the repository, then **Report a vulnerability**
([direct link](https://github.com/marceloancieta/web-qa-agentic-framework/security/advisories/new)).
Never open a public issue, pull request or discussion about it: a public report shows the problem to
everyone before it is fixed.

Include what is affected (a script, a hook, a helper, a workflow), how to reproduce it, and what an
attacker could do with it. The report stays private until a fix or a decision is published.

## Scope

In scope: the framework itself, meaning the scripts, the Claude Code hooks, the execution core, the
adapters, the CI workflows and anything that could leak a credential or let a test reach a system it
was not configured for.

Out of scope: a vulnerability of an application under test. OWASP Juice Shop, one of the example
packs, is insecure on purpose, and finding its vulnerabilities is what it is for; a vulnerability of
any application belongs to that application's project, not this one.

## What the framework does to keep secrets out

- **Credentials come from the environment or a local `.env`**, which git ignores, never from
  arguments, specs, configuration or docs. A missing variable is named by its name, never its value.
- **`secret-guard`**, a Claude Code hook, refuses prompts and tool calls that carry a credential or
  read the files that usually hold one, and masks credentials in tool output
  ([hooks](.claude/hooks/README.md)).
- **gitleaks and a local denylist** scan every commit before it is made, and the gates scan the
  whole history before every push. The denylist lives in `.git/info/denylist`, so the terms it
  protects can never be committed.
- **Evidence is redacted.** Attachments and HAR files are redacted by key, screenshots mask the
  fields that show what was typed, and after each run the last reporter removes the run's secrets
  from traces, the HTML report and the Allure results.
- **Browser sessions stay under `.auth/`**, which git ignores.
- **The supply chain is pinned.** Workflow actions are pinned to commit SHAs, dependency updates wait
  for a cooldown, `npm audit` is held clean, and container images are pinned by digest.

## Responsible use

Use the framework only against systems you are authorised to test, in the environments qa-config
names, and never against production. Design work only reads an application; writes happen in spec
runs, with data the run creates ([modes](.claude/rules/modes.md)).

## Supported versions

Before 1.0, only the latest release receives security fixes.
