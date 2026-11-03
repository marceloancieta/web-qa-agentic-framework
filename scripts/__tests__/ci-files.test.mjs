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
import { LANES } from '../lanes.mjs';

const scripts = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).scripts;
const workflow = parse(readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8'));
const jenkinsfile = readFileSync(join(REPO_ROOT, 'Jenkinsfile'), 'utf8');

// Commands that install or probe the toolchain rather than test anything: gitleaks, which the secret
// scan of the gates needs, the pinned npm the publish job needs for trusted publishing, and the
// Jenkins Node stage's checks of the agent's Node and npm.
const TOOLCHAIN = [
  /^curl -sSfL "https:\/\/github\.com\/gitleaks\/gitleaks\/releases\/download\//,
  /^npm install --global npm@\d+\.\d+\.\d+$/,
  /^node -p "process\.(?:versions\.node|platform)\b/,
  /^npm exec -c "node -p process\.platform"$/,
];

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

// Every step of the Jenkinsfile goes through its `shell` helper (`sh` or `bat` by agent), as
// `shell '<command>'`, `shell "<command>"` or `shell(<options>, '<command>')`; a bare `sh` or `bat`
// would run on one platform only.
const jenkinsCommands = () =>
  [...jenkinsfile.matchAll(/\bshell\s*\(?\s*(?:\w+:\s*\w+,\s*)*(['"])((?:\\.|(?!\1).)*)\1/g)].map(
    (match) => match[2].replace(/\\(["'])/g, '$1').trim(),
  );

test('the Jenkinsfile runs no step outside its shell helper', () => {
  const body = jenkinsfile.replace(/def shell\([\s\S]*?\n\}\n/, '');
  assert.deepEqual(body.match(/\b(?:sh|bat)\s*[('"]/g) ?? [], []);
});

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

test('every step of the Jenkinsfile calls an npm script', () => {
  const commands = jenkinsCommands();
  assert.ok(commands.length > 10);
  assert.deepEqual(commands.map(notAnNpmScript).filter(Boolean), []);
});

// The test-management token is bound in one place, and only the report step runs inside it.
test('the Jenkinsfile gives the Allure TestOps token to tm:report only', () => {
  const helper = /def withTestManagement\([\s\S]*?\n\}\n/.exec(jenkinsfile)?.[0] ?? '';
  assert.match(
    helper,
    /withCredentials\(\[string\(credentialsId: tokenCredential, variable: 'ALLURE_TOKEN'\)\]\)/,
  );
  assert.equal(jenkinsfile.replace(helper, '').match(/withCredentials/g), null);
  const wrapped = [...jenkinsfile.matchAll(/withTestManagement \{([\s\S]*?)\n\s*\}/g)].map((m) =>
    m[1].trim(),
  );
  assert.deepEqual(wrapped, ["shell 'npm run tm:report'"]);
  for (const name of ['ALLURE_TOKEN_CREDENTIALS_ID', 'ALLURE_ENDPOINT', 'ALLURE_PROJECT_ID']) {
    assert.match(jenkinsfile, new RegExp(`string\\(name: '${name}'`), name);
  }
});

// A lane refuses an option it fixes itself (lanes.mjs), so the Jenkinsfile's WORKERS never reaches
// a lane that fixes its workers.
test('a lane that fixes its workers gets none from the Jenkinsfile', () => {
  const fixed = Object.entries(LANES)
    .filter(([, lane]) => (lane.args ?? []).some((arg) => arg.startsWith('--workers')))
    .map(([name]) => name);
  assert.ok(fixed.includes('destructive'));
  for (const name of fixed) {
    const calls = jenkinsCommands().filter((line) => line.startsWith(`npm run lanes:${name} `));
    assert.ok(calls.length > 0, name);
    for (const call of calls) assert.match(call, /\$\{playwrightOptions\(false\)\}/, name);
  }
});

test('the lanes the workflow runs are scripts, and the quality gate reads each one report', () => {
  const lanes = workflow.jobs.lane.strategy.matrix.lane;
  for (const lane of lanes) assert.ok(Object.hasOwn(scripts, `lanes:${lane}`), lane);
  const gate = workflowCommands().find((line) => line.startsWith('npm run quality:gate'));
  for (const lane of lanes) assert.ok(gate.includes(`reports/lanes/${lane}.json`), lane);
  assert.ok(gate.includes('reports/playwright.json'));
});

// CI-06: "Re-run failed jobs" runs a shard again as a new attempt and keeps the lanes' reports of
// the first one. With the attempt in the id, the quality gate refused the mix as another run's.
test('one QA_RUN_ID covers a run and its re-runs: the run id, never the attempt', () => {
  assert.equal(workflow.env.QA_RUN_ID, 'gh-${{ github.run_id }}');
  assert.doesNotMatch(
    readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8'),
    /QA_RUN_ID:.*run_attempt/,
  );
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

test("Node's typings stay on the Node major the project supports, and Dependabot leaves them there", () => {
  const major = (version) => Number(/(\d+)/.exec(version)?.[1]);
  const nvmrc = major(readFileSync(join(REPO_ROOT, '.nvmrc'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.equal(major(manifest.engines.node), nvmrc, 'engines.node and .nvmrc name one major');
  assert.equal(
    major(manifest.devDependencies['@types/node']),
    nvmrc,
    '@types/node is on that major',
  );
  const { updates } = parse(readFileSync(join(REPO_ROOT, '.github', 'dependabot.yml'), 'utf8'));
  const npm = updates.find((u) => u['package-ecosystem'] === 'npm');
  const rule = (npm.ignore ?? []).find((i) => i['dependency-name'] === '@types/node');
  assert.deepEqual(rule?.['update-types'], ['version-update:semver-major']);
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

// The workflows on the local machine (CI-05): `act` runs each job in a container of the image
// `.actrc` maps to its runner label, on the compose network, where Juice Shop answers by its service
// name; and it sets ACT, which skips the artifact steps its artifact server cannot serve.
const actrc = readFileSync(join(REPO_ROOT, '.actrc'), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));
const compose = parse(readFileSync(join(REPO_ROOT, 'docker', 'compose.yml'), 'utf8'));

/** The artifact steps of a workflow that would also run under act. */
export function artifactStepsUnderAct(workflowText) {
  const { jobs = {} } = parse(workflowText) ?? {};
  return Object.entries(jobs).flatMap(([job, { steps = [] }]) =>
    steps
      .filter((step) => /^actions\/(?:upload|download)-artifact@/.test(step.uses ?? ''))
      .filter((step) => !/!\s*env\.ACT\b/.test(String(step.if ?? '')))
      .map((step) => `${job}: ${step.uses.split('@')[0]}`),
  );
}

test('an artifact step without the act guard is a finding', () => {
  const step = (uses, condition) => ({ jobs: { t: { steps: [{ uses, if: condition }] } } });
  const yaml = (doc) => JSON.stringify(doc);
  const upload = `actions/upload-artifact@${'a'.repeat(40)}`;
  assert.equal(artifactStepsUnderAct(yaml(step(upload, 'always()'))).length, 1);
  assert.equal(artifactStepsUnderAct(yaml(step(upload))).length, 1);
  assert.equal(artifactStepsUnderAct(yaml(step(upload, '${{ env.ACT }}'))).length, 1);
  assert.deepEqual(artifactStepsUnderAct(yaml(step(upload, '${{ always() && !env.ACT }}'))), []);
  assert.deepEqual(artifactStepsUnderAct(yaml(step(`actions/checkout@${'b'.repeat(40)}`))), []);
});

test('no workflow runs an artifact step under act', () => {
  for (const name of workflowFiles()) {
    assert.deepEqual(artifactStepsUnderAct(readFileSync(join(WORKFLOWS, name), 'utf8')), [], name);
  }
});

test('.actrc gives every runner label of every workflow an image', () => {
  const mapped = actrc.map((line) => /^-P\s+([\w.-]+)=\S+$/.exec(line)?.[1]).filter(Boolean);
  const labels = workflowFiles().flatMap((name) =>
    Object.values(parse(readFileSync(join(WORKFLOWS, name), 'utf8')).jobs).map(
      (job) => job['runs-on'],
    ),
  );
  assert.ok(labels.length > 5);
  for (const label of new Set(labels)) assert.ok(mapped.includes(label), label);
});

test('.actrc runs one job at a time on the host network, where Juice Shop is at its CI URL', () => {
  // Every job shares the one Juice Shop of the host, which the destructive lane restarts.
  assert.ok(actrc.includes('--concurrent-jobs 1'), 'one job at a time');
  // The published port binds the host's loopback, which only the host network reaches; the
  // service name would change the origin the application sees (Juice Shop offers its Google
  // login on localhost only).
  assert.ok(actrc.includes('--network host'), 'the host network');
  assert.ok(!actrc.some((line) => /_BASE_URL=/.test(line)), 'no base URL of its own');
  const ci = JSON.parse(readFileSync(join(REPO_ROOT, 'qa-config.example.json'), 'utf8')).app
    .environments.ci.packs['juice-shop'].base_url;
  const published = compose.services['juice-shop'].ports[0].split(':');
  assert.equal(ci, `http://localhost:${published.at(-2)}`, 'CI reaches the published port');
  assert.equal(published[0], '127.0.0.1');
});
