# create-web-qa

Starts a web UI test project from a release of the web-qa agentic framework:

```sh
npm create web-qa@<version> <dir>
```

The project gets the framework's product: the Claude Code skills, rules, agents and hooks
(`.claude/`), `AGENTS.md` and `CLAUDE.md`, the templates, the execution core, the scripts and the
gates, and the two example packs. It does not get the framework's own development records (its
backlog, changelog and decisions); its documents link to them in the framework's repository instead.

The release is recorded in `.web-qa.json`, so `npm run framework:update -- --to v<x.y.z>` takes a
later one. The guide `docs/guides/adopting.md` in the generated project covers the rest.
