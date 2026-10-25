import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  combinations,
  expandRules,
  loadDecisionTable,
  MAX_COMBINATIONS,
  parseDecisionTable,
} from '../lib/decision-table.mjs';

const BUTTON = `conditions:
  email: [empty, filled]
  password: [empty, filled]
actions:
  button: [disabled, enabled]
rules:
  - when: { email: empty, password: '-' }
    then: { button: disabled }
  - when: { email: filled, password: empty }
    then: { button: disabled }
  - when: { email: filled, password: filled }
    then: { button: enabled }
`;

const messages = (table) => table.problems.map((p) => `${p.rule} ${p.line} ${p.message}`);

test('combinations multiply the condition values in the order the table lists them', () => {
  assert.deepEqual(combinations({ a: ['x', 'y'], b: ['1', '2'] }), [
    { a: 'x', b: '1' },
    { a: 'x', b: '2' },
    { a: 'y', b: '1' },
    { a: 'y', b: '2' },
  ]);
});

test('a complete table expands to one step per combination, "-" rules included', () => {
  const table = parseDecisionTable(BUTTON, 'apps/shop/rules/TC-LOGIN-03.yaml');
  assert.deepEqual(table.problems, []);
  assert.equal(table.id, 'TC-LOGIN-03');
  assert.deepEqual(
    expandRules(table).map(({ when, then }) => `${when.email}/${when.password} ${then.button}`),
    [
      'empty/empty disabled',
      'empty/filled disabled',
      'filled/empty disabled',
      'filled/filled enabled',
    ],
  );
});

test('YAML scalars that are not strings compare as their text', () => {
  const table = parseDecisionTable(
    'conditions:\n  remember: [true, false]\nactions:\n  kept: [0, 1]\nrules:\n  - { when: { remember: true }, then: { kept: 1 } }\n  - { when: { remember: false }, then: { kept: 0 } }\n',
    'TC-LOGIN-09.yaml',
  );
  assert.deepEqual(table.problems, []);
  assert.deepEqual(expandRules(table)[0], { when: { remember: 'true' }, then: { kept: '1' } });
});

test('a rule missing a condition, an action or naming an unknown value is a shape problem on its line', () => {
  const text = BUTTON.replace("password: '-' }", '}').replace('button: enabled', 'button: on');
  const table = parseDecisionTable(text, 'TC-LOGIN-03.yaml');
  assert.deepEqual(messages(table), [
    'decision-table-shape 7 rule 1: when has no value for password (use "-" for any)',
    'decision-table-shape 11 rule 3: then.button "on" is not one of disabled, enabled',
  ]);
  assert.throws(() => expandRules(table), /TC-LOGIN-03\.yaml:7 rule 1/);
});

test('invalid YAML, an empty rule list and too many combinations are reported, never thrown', () => {
  assert.match(messages(parseDecisionTable('rules: [\n', 'TC-AB-01.yaml'))[0], /not valid YAML/);
  assert.deepEqual(
    messages(parseDecisionTable(BUTTON.replace(/rules:[\s\S]*/, 'rules: []\n'), 'TC-AB-01.yaml')),
    ['decision-table-shape 6 `rules` must list at least one rule'],
  );
  const wide = Array.from({ length: 7 }, (_, i) => `  c${i}: [a, b]`).join('\n');
  const big = parseDecisionTable(
    `conditions:\n${wide}\nactions:\n  r: [x, y]\nrules:\n  - { when: {}, then: { r: x } }\n`,
    'TC-AB-01.yaml',
  );
  assert.ok(
    messages(big).some((m) =>
      m.includes(`128 combinations; split the table (at most ${MAX_COMBINATIONS})`),
    ),
  );
});

test('a gap lists the first combinations and how many there are; a conflict names both rules', () => {
  const gap = parseDecisionTable(
    BUTTON.split('\n')
      .filter((_, index) => index !== 8 && index !== 9) // rule 2 and its `then`
      .join('\n'),
    'TC-AB-01.yaml',
  );
  assert.deepEqual(messages(gap), [
    'decision-table-gap 6 1 combination(s) no rule covers: {email=filled, password=empty}',
  ]);
  const conflict = parseDecisionTable(
    `${BUTTON}  - when: { email: '-', password: filled }\n    then: { button: enabled }\n`,
    'TC-AB-01.yaml',
  );
  assert.deepEqual(messages(conflict), [
    'decision-table-conflict 13 rule 4 gives email=empty, password=filled button=enabled; rule 1 gives button=disabled',
  ]);
});

test('loadDecisionTable reads a file and refuses one the linter would refuse', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dt-'));
  writeFileSync(join(dir, 'TC-LOGIN-03.yaml'), BUTTON);
  assert.equal(loadDecisionTable(join(dir, 'TC-LOGIN-03.yaml')).length, 4);
  writeFileSync(join(dir, 'login.yaml'), BUTTON);
  assert.throws(() => loadDecisionTable(join(dir, 'login.yaml')), /named after its case/);
});
