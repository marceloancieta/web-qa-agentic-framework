// The CI files only call the npm scripts (architecture section 5): what a pipeline runs is what a
// person runs on their machine, and a vendor's file never holds logic of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { REPO_ROOT } from '../lib/cli.mjs';

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
