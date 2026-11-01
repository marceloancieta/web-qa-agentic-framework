// The CI files only call the npm scripts (architecture section 5): what a pipeline runs is what a
// person runs on their machine, and a vendor's file never holds logic of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { REPO_ROOT } from '../lib/cli.mjs';
import { DEPENDENCY_UPDATES } from '../changelog.mjs';
import { titleProblem } from '../commit-title.mjs';

const scripts = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).scripts;
const workflow = parse(readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8'));
const jenkinsfile = readFileSync(join(REPO_ROOT, 'Jenkinsfile'), 'utf8');

// Commands that install the toolchain rather than test anything: gitleaks, which the secret scan
// of the gates needs.
const TOOLCHAIN = [/^curl -sSfL "https:\/\/github\.com\/gitleaks\/gitleaks\/releases\/download\//];

/** Why a command line is not an npm script call, or null when it is one. */
export function notAnNpmScript(line) {
  const command = line.replace(/^(?:[A-Z_]+=\S*\s+)+/, '').trim();
  if (TOOLCHAIN.some((pattern) => pattern.test(command))) return null;
  if (command === 'npm ci' || /^npm test(?:\s|$)/.test(command)) return null;
  const run = /^npm run ([\w:-]+)(\$\{\{ matrix\.\w+ \}\})?(?:\s|$)/.exec(command);
  if (!run) return `"${command}" does not call an npm script`;
  // The workflow names a lane through its matrix (lanes:${{ matrix.lane }}); the lanes test below
  // checks each value of the matrix.
  if (run[2]) return null;
  return Object.hasOwn(scripts, run[1])
    ? null
    : `npm run ${run[1]}: no such script in package.json`;
}

const workflowCommands = () =>
  Object.values(workflow.jobs).flatMap((job) =>
    (job.steps ?? [])
      .filter((step) => typeof step.run === 'string')
      .flatMap((step) => step.run.split('\n'))
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#')),
  );

const jenkinsCommands = () =>
  [...jenkinsfile.matchAll(/\bsh\s+(['"])(.*?)\1/g)].map((match) => match[2].trim());

test('a command line is an npm script call, a toolchain install, or a finding', () => {
  assert.equal(notAnNpmScript('npm run gates'), null);
  assert.equal(notAnNpmScript('QA_BLOB_REPORT=1 npm test -- --shard=1/4'), null);
  assert.equal(notAnNpmScript('npm ci'), null);
  assert.match(notAnNpmScript('npx playwright test'), /does not call an npm script/);
  assert.match(notAnNpmScript('npm run no-such-script'), /no such script/);
  assert.match(notAnNpmScript('rm -rf reports'), /does not call an npm script/);
});

test('every run step of the GitHub workflow calls an npm script', () => {
  const commands = workflowCommands();
  assert.ok(commands.length > 10);
  assert.deepEqual(commands.map(notAnNpmScript).filter(Boolean), []);
});

test('every sh step of the Jenkinsfile calls an npm script', () => {
  const commands = jenkinsCommands();
  assert.ok(commands.length > 10);
  assert.deepEqual(commands.map(notAnNpmScript).filter(Boolean), []);
});

test('the lanes the workflow runs are scripts, and the quality gate reads each one report', () => {
  const lanes = workflow.jobs.lane.strategy.matrix.lane;
  for (const lane of lanes) assert.ok(Object.hasOwn(scripts, `lanes:${lane}`), lane);
  const gate = workflowCommands().find((line) => line.startsWith('npm run quality:gate'));
  for (const lane of lanes) assert.ok(gate.includes(`reports/lanes/${lane}.json`), lane);
  assert.ok(gate.includes('reports/playwright.json'));
});

test('the shard list and its total agree', () => {
  const { shard, total } = workflow.jobs.suite.strategy.matrix;
  assert.deepEqual(
    shard,
    Array.from({ length: total[0] }, (_, index) => index + 1),
  );
});

// Supply chain (CI-03): a tag can be moved to other code after review, a commit cannot. Every action
// is pinned to a full commit SHA, with the version it was in a comment that Dependabot updates too.
const WORKFLOWS = join(REPO_ROOT, '.github', 'workflows');
const workflowFiles = () => readdirSync(WORKFLOWS).filter((name) => /\.ya?ml$/.test(name));
const PINNED = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/;

/** Why a `uses:` value is not a pinned action, or null when it is one. */
export function notPinned(uses) {
  if (uses.startsWith('./')) return null; // an action of this repository
  return PINNED.test(uses) ? null : `"${uses}" is not owner/repo@<40-hex sha> # vX.Y.Z`;
}

test('a uses value is a full commit SHA with its version, or a finding', () => {
  assert.equal(notPinned(`actions/checkout@${'a'.repeat(40)} # v7.0.1`), null);
  assert.equal(notPinned(`github/codeql-action/init@${'b'.repeat(40)} # v4.39.0`), null);
  assert.equal(notPinned('./.github/actions/setup'), null);
  assert.match(notPinned('actions/checkout@v7'), /is not owner\/repo/);
  assert.match(notPinned(`actions/checkout@${'a'.repeat(40)}`), /is not owner\/repo/);
  assert.match(notPinned(`actions/checkout@${'a'.repeat(7)} # v7.0.1`), /is not owner\/repo/);
});

test('every action of every workflow is pinned to a commit SHA', () => {
  const uses = workflowFiles().flatMap((name) =>
    readFileSync(join(WORKFLOWS, name), 'utf8')
      .split('\n')
      .map((line) => /^\s*(?:-\s+)?uses:\s*(.+?)\s*$/.exec(line)?.[1])
      .filter(Boolean)
      .map((value) => ({ name, value })),
  );
  assert.ok(uses.length > 10);
  assert.deepEqual(
    uses
      .map(({ name, value }) => notPinned(value) && `${name}: ${notPinned(value)}`)
      .filter(Boolean),
    [],
  );
});

test('every run step of every workflow calls an npm script', () => {
  for (const name of workflowFiles()) {
    const jobs = parse(readFileSync(join(WORKFLOWS, name), 'utf8')).jobs;
    const commands = Object.values(jobs)
      .flatMap((job) => (job.steps ?? []).filter((step) => typeof step.run === 'string'))
      .flatMap((step) => step.run.split('\n'))
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    assert.deepEqual(commands.map(notAnNpmScript).filter(Boolean), [], name);
  }
});

test('Dependabot: every ecosystem waits 14 days, and its titles pass the commit convention', () => {
  const { updates } = parse(readFileSync(join(REPO_ROOT, '.github', 'dependabot.yml'), 'utf8'));
  assert.deepEqual(updates.map((u) => u['package-ecosystem']).sort(), ['github-actions', 'npm']);
  for (const update of updates) {
    const ecosystem = update['package-ecosystem'];
    assert.equal(update.cooldown?.['default-days'], 14, ecosystem);
    assert.equal(update['commit-message']?.include, 'scope', ecosystem);
    // With `include: scope`, Dependabot writes `deps` for runtime and `deps-dev` for development
    // dependencies; the actions have only `deps`.
    const scopes = ecosystem === 'npm' ? ['deps', 'deps-dev'] : ['deps'];
    for (const scope of scopes) {
      const title = `${update['commit-message'].prefix}(${scope}): bump x from 1.0.0 to 1.1.0`;
      assert.ok(DEPENDENCY_UPDATES.includes(title.split(':')[0]), title);
      assert.equal(titleProblem(title), null, title);
    }
  }
});

// Script injection (DOC-05): text an outsider controls (a pull request's title or body, a branch
// name, a commit message) written into `run:` with ${{ }} is executed as shell code. It reaches a
// script only through `env:`.
const UNTRUSTED =
  /\$\{\{\s*github\.(?:event\.(?:pull_request\.(?:title|body|head\.ref|head\.label)|issue\.(?:title|body)|comment\.body|review\.body|head_commit\.message|commits)|head_ref)\b/;

/** The `run:` scripts of a workflow that write untrusted event text into the shell. */
export function injectedRuns(workflowText) {
  const { jobs = {} } = parse(workflowText) ?? {};
  return Object.entries(jobs).flatMap(([job, { steps = [] }]) =>
    steps
      .filter((step) => typeof step.run === 'string' && UNTRUSTED.test(step.run))
      .map((step) => `${job}: ${step.run.trim()}`),
  );
}

test('untrusted event text in a run script is a finding; through env it is not', () => {
  const step = (run, env) => ({ jobs: { t: { steps: [{ run, env }] } } });
  const yaml = (doc) => JSON.stringify(doc); // JSON is YAML
  assert.equal(
    injectedRuns(yaml(step('npm run commit:title -- "${{ github.event.pull_request.title }}"')))
      .length,
    1,
  );
  assert.equal(injectedRuns(yaml(step('echo ${{ github.head_ref }}'))).length, 1);
  assert.deepEqual(
    injectedRuns(
      yaml(
        step('npm run commit:title -- "$PR_TITLE"', {
          PR_TITLE: '${{ github.event.pull_request.title }}',
        }),
      ),
    ),
    [],
  );
  assert.deepEqual(injectedRuns(yaml(step('echo ${{ github.run_id }}'))), []);
});

test('no workflow writes untrusted event text into a run script', () => {
  for (const name of workflowFiles()) {
    assert.deepEqual(injectedRuns(readFileSync(join(WORKFLOWS, name), 'utf8')), [], name);
  }
});

// The checks docs/repository-settings.md tells the owner to require (DOC-05) exist, run on pull
// requests, and are named as GitHub names them: a required check that never reports blocks every
// merge, and one renamed in a workflow silently stops being required.
test('every required check of the repository settings is a job that runs on pull requests', () => {
  const settings = readFileSync(join(REPO_ROOT, 'docs', 'repository-settings.md'), 'utf8');
  const rows = [...settings.matchAll(/^\s*\| `([\w-]+)` \| \[`([\w.-]+\.ya?ml)`\]/gm)];
  assert.deepEqual(rows.map(([, check]) => check).sort(), ['required', 'title']);
  for (const [, check, file] of rows) {
    const flow = parse(readFileSync(join(WORKFLOWS, file), 'utf8'));
    const events = Array.isArray(flow.on) ? flow.on : Object.keys(flow.on ?? {});
    assert.ok(events.includes('pull_request'), `${file} runs on pull requests`);
    const job = flow.jobs?.[check];
    assert.ok(job, `${file} has a job ${check}`);
    assert.equal(job.name ?? check, check, `${check} keeps its id as its check name`);
    assert.equal(job.strategy, undefined, `${check} is not a matrix, so its name has no suffix`);
  }
});

test('the required job depends on every other job of the change', () => {
  const { jobs } = workflow;
  const others = Object.keys(jobs).filter((name) => !['required', 'flake'].includes(name));
  assert.deepEqual([...jobs.required.needs].sort(), others.sort());
  assert.match(jobs.required.if, /always\(\)/, 'it reports even when a job it needs failed');
});
