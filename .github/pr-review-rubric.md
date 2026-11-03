# Pull-request review rubric

The advisory AI review (`npm run review:pr`, workflow `pr-review`) reads a pull request's diff
against this rubric. It looks for what a person would catch and a check cannot. It approves nothing
and blocks nothing: its comment is a second reader's notes for the reviewer.

## Look for

1. **Behaviour the change breaks.** A condition inverted, an edge left out (empty, one, many, the
   limit), an error swallowed or turned into success, an exit code that hides a failure, a promise
   not awaited, state shared between tests or runs.
2. **Tests that cannot fail.** For each changed behaviour, would a test fail if the change were
   reverted? An assertion on a value the test itself wrote, a check inside a branch that may not run,
   a mock that answers what the code under test expects, a fixture with no look-alike beside the
   defect it plants.
3. **Layers and modes in spirit.** A page object that decides what is correct, a spec that knows how
   a page is built, a flow that asserts (ADR 0005); design work that writes to the application, or
   execution that edits a spec, a registry or a baseline (`.claude/rules/modes.md`).
4. **Updates never made.** The propagation table of `.claude/rules/documentation.md`, walked by hand:
   a policy, rule, skill, template, script or configuration key that changed while a file that
   applies or describes it did not. A fact restated in a second place instead of linked.
5. **Security of the change.** Untrusted text (an issue, a pull request, a page, a log) that reaches a
   shell, a prompt or a file path; a credential that could reach a log, a trace, a URL, an artifact or
   an argument; a workflow permission wider than its steps need.
6. **Data the cases depend on.** A spec that types a real-looking credential, reuses data another
   case changes, or relies on the order of cases.
7. **Wording.** Claims the code does not support, statements about the past in the present tense, and
   text that presents the framework as taken from somewhere else.

For each finding give the file and line, what goes wrong with a concrete case, and how sure you are.
Prefer a few findings that matter over many that might.

## Left to the gates

Do not report what these already check on every push; a finding they would raise is noise here.

- `lint`: ESLint over the code.
- `format:check`: Prettier formatting.
- `types:check`: TypeScript types.
- `config:check`: qa-config against its schema and the cross-field rules.
- `test:hooks`, `test:scripts`, `test:unit`: the tests of the hooks, scripts and core.
- `lint:qa`: the QA linters (layers, harness, suite, docs) and their self-tests.
- `coverage:status`, `traceability`: case counts and requirement coverage.
- `cited-status`: tracker keys the registries and contracts cite that are closed or unknown, when
  the tracker is kept in the repository.
- `scan:denylist:self-test`, `scan:denylist`, `scan:denylist:history`: names and hosts that must
  not appear.
- `lint:docs:history`: wording in the commit history.
- `scan:secrets`: credentials, with gitleaks, over the whole history.
- The CI also runs `audit:deps` (known vulnerable dependencies) and the `title` check (the pull
  request title follows the commit convention).
