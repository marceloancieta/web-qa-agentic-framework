# Web QA Agentic Framework

A framework for testing web user interfaces with Playwright and TypeScript, driven by a five-phase
process (intake, design, automate, publish, run) with a human review gate after each phase, and
Claude Code skills, rules, hooks and agents that carry the process. It is the sibling of
[api-qa-agentic-framework](https://github.com/marceloancieta/api-qa-agentic-framework).

**Status:** under construction, before v0.1.0. The stages and what each one delivers are in
[`docs/backlog.md`](docs/backlog.md); the design is in [`docs/architecture.md`](docs/architecture.md).

## Requirements

- Node 22 or later
- [gitleaks](https://github.com/gitleaks/gitleaks#installing) for the secret scan
- Docker, from the first local app pack on

## Getting started

```sh
npm ci
npm run hooks:install   # secret scan and denylist before each commit, gates before each push
npm run gates
```

## License

[Apache License 2.0](LICENSE). See [`NOTICE`](NOTICE).
