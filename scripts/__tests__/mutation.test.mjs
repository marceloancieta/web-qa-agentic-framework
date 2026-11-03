import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import strykerConfig from '../../stryker.config.mjs';
import hooksConfig from '../../stryker.hooks.config.mjs';
import { REPO_ROOT } from '../lib/cli.mjs';
import { evaluate, mutationScore } from '../quality-gate.mjs';

const GATE = join(REPO_ROOT, 'scripts', 'quality-gate.mjs');

/** A Stryker JSON report with these mutant statuses, spread over two files. */
function strykerReport(statuses) {
  const mutants = statuses.map((status, index) => ({ id: String(index), status }));
  const half = Math.ceil(mutants.length / 2);
  return {
    schemaVersion: '1.0',
    files: {
      'scripts/lib/a.mjs': { language: 'javascript', source: '', mutants: mutants.slice(0, half) },
      '.claude/hooks/lib/b.mjs': {
        language: 'javascript',
        source: '',
        mutants: mutants.slice(half),
      },
    },
  };
}

const repeat = (status, times) => Array.from({ length: times }, () => status);

test('the score counts killed and timed-out mutants over every mutant that ran or is not covered', () => {
  const report = strykerReport([
    ...repeat('Killed', 6),
    'Timeout',
    'Survived',
    'NoCoverage',
    'CompileError',
    'RuntimeError',
    'Ignored',
    'Pending',
  ]);
  assert.deepEqual(mutationScore([report]), {
    score: 77.8,
    detected: 7,
    valid: 9,
    survived: 1,
    noCoverage: 1,
  });
  assert.equal(mutationScore([strykerReport(['Ignored', 'CompileError'])]).score, null);
  assert.equal(mutationScore([{}]).score, null);
  assert.equal(mutationScore([]).score, null);
});

test('the reports of both runs make one score, not an average of two', () => {
  const scripts = strykerReport([...repeat('Killed', 9), 'Survived']);
  const hooks = strykerReport(['Killed', 'Survived']);
  // 10 of 12 detected (83.3%), where the mean of 90% and 50% would be 70%.
  assert.deepEqual(mutationScore([scripts, hooks]), {
    score: 83.3,
    detected: 10,
    valid: 12,
    survived: 2,
    noCoverage: 0,
  });
});

test('the mutation check bands the score like the pass rate, and skips without a report', () => {
  const gate = { mutation: { fail_below_pct: 60, review_below_pct: 80 } };
  const check = (statuses) =>
    evaluate({ suites: [] }, gate, '.', { mutation: [strykerReport(statuses)] }).checks[0];
  assert.deepEqual(check([...repeat('Killed', 8), ...repeat('Survived', 2)]), {
    name: 'mutation',
    verdict: 'PASS',
    detail: '80% (8/10 detected; 2 survived, 0 not covered)',
  });
  assert.equal(check([...repeat('Killed', 7), ...repeat('Survived', 3)]).verdict, 'REVIEW');
  assert.equal(check([...repeat('Killed', 6), ...repeat('NoCoverage', 4)]).verdict, 'REVIEW');
  assert.equal(check([...repeat('Killed', 5), ...repeat('NoCoverage', 5)]).verdict, 'FAIL');
  assert.equal(check(['Ignored']).verdict, 'SKIPPED');
  assert.deepEqual(evaluate({ suites: [] }, gate).checks, [
    { name: 'mutation', verdict: 'SKIPPED', detail: 'no mutation report (npm run mutation)' },
  ]);
  assert.deepEqual(evaluate({ suites: [] }, {}, '.', { mutation: [strykerReport(['Survived'])] }), {
    checks: [],
    overall: 'PASS',
  });
});

/** A root with a qa-config.json holding `gate`, and a mutation report with these statuses. */
function gateRoot(gate, statuses) {
  const root = mkdtempSync(join(tmpdir(), 'mutation-gate-'));
  writeFileSync(join(root, 'qa-config.json'), JSON.stringify({ quality_gate: gate }));
  writeFileSync(join(root, 'mutation.json'), JSON.stringify(strykerReport(statuses)));
  return root;
}

const runGate = (root, ...args) =>
  spawnSync(process.execPath, [GATE, '--root', root, ...args], { encoding: 'utf8' });

test('--mutation alone judges the score without a run report, and its exit code follows the verdict', () => {
  const gate = { mutation: { fail_below_pct: 60 } };
  const passing = gateRoot(gate, [...repeat('Killed', 3), 'Survived']);
  const pass = runGate(
    passing,
    '--mutation',
    join(passing, 'mutation.json'),
    '--summary',
    join(passing, 's.md'),
  );
  assert.equal(pass.status, 0, pass.stderr);
  assert.match(pass.stdout, /mutation +PASS +75% \(3\/4 detected; 1 survived, 0 not covered\)/);
  assert.match(readFileSync(join(passing, 's.md'), 'utf8'), /^# Quality gate: PASS/);
  const failing = gateRoot(gate, ['Killed', 'Survived']);
  const fail = runGate(failing, '--mutation', join(failing, 'mutation.json'));
  assert.equal(fail.status, 1);
  assert.match(fail.stdout, /quality-gate: FAIL/);
  // Two --mutation reports are judged together: 4 of 6 detected.
  const both = runGate(
    passing,
    '--mutation',
    join(passing, 'mutation.json'),
    '--mutation',
    join(failing, 'mutation.json'),
  );
  assert.equal(both.status, 0, both.stderr);
  assert.match(both.stdout, /mutation +PASS +66\.7% \(4\/6 detected/);
});

test('--mutation refuses a missing report and a configuration without its threshold', () => {
  const root = gateRoot({ mutation: { fail_below_pct: 60 } }, ['Killed']);
  const missing = runGate(root, '--mutation', join(root, 'absent.json'));
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /cannot read the mutation report .*run npm run mutation first/);
  const unset = gateRoot({}, ['Killed']);
  const usage = runGate(unset, '--mutation', join(unset, 'mutation.json'));
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /--mutation needs qa-config quality_gate\.mutation/);
});

test('mutation testing covers both libraries on demand, outside the gates', () => {
  assert.deepEqual(strykerConfig.mutate, ['scripts/lib/**/*.mjs']);
  assert.deepEqual(hooksConfig.mutate, ['.claude/hooks/lib/**/*.mjs']);
  // The hook suites run each hook as a child process, which per-test coverage cannot see into.
  assert.equal(hooksConfig.testRunner, 'command');
  assert.equal(hooksConfig.coverageAnalysis, 'off');
  const { scripts } = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  for (const [config, name] of [
    [strykerConfig, 'scripts-lib'],
    [hooksConfig, 'hooks-lib'],
  ]) {
    // The quality gate judges the score, so Stryker never fails a run on its own.
    assert.equal(config.thresholds.break, null);
    assert.equal(config.jsonReporter.fileName, `reports/mutation/${name}.json`);
    assert.ok(scripts['mutation:gate'].includes(`--mutation reports/mutation/${name}.json`));
  }
  assert.equal(
    scripts.mutation,
    'stryker run && stryker run stryker.hooks.config.mjs && npm run mutation:gate',
  );
  assert.doesNotMatch(scripts.gates, /mutation|stryker/);
  const example = JSON.parse(readFileSync(join(REPO_ROOT, 'qa-config.example.json'), 'utf8'));
  assert.equal(typeof example.quality_gate.mutation.fail_below_pct, 'number');
});
