import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import { parseRegistry } from '../lib/registry.mjs';
import { tableCells } from '../lib/text.mjs';

// The evaluation fixtures of ui-spec-reviewer, kept in step with the agent: the checks it
// catalogues, the seeded markers and the README's expected findings must name the same things, or
// an evaluation measures against a key that no longer fits.

const DIR = join(REPO_ROOT, 'scripts', '__fixtures__', 'agents', 'ui-spec-reviewer');
const AGENT = join(REPO_ROOT, '.claude', 'agents', 'ui-spec-reviewer.md');
const SEVERITIES = ['blocker', 'major', 'minor'];
const MARKER = /\/\/ expect-review: ([a-z, -]+)$/;

const read = (name) => readFileSync(join(DIR, name), 'utf8');
const sources = readdirSync(DIR).filter((name) => name.endsWith('.ts'));
const specs = sources.filter((name) => name.endsWith('.spec.ts'));

/** The check ids of the agent: the `- \`id\`` bullets of its Checks section. */
function catalogue() {
  const text = readFileSync(AGENT, 'utf8');
  const section = text.slice(text.indexOf('## Checks'), text.indexOf('## Severity'));
  return [...section.matchAll(/^- `([a-z-]+)`/gm)].map((match) => match[1]);
}

/** Every marker as `file check`, one entry per check it names. */
function markers() {
  return sources.flatMap((file) =>
    read(file)
      .split(/\r?\n/)
      .flatMap((line) => {
        const match = MARKER.exec(line);
        return match ? match[1].split(',').map((check) => `${file} ${check.trim()}`) : [];
      }),
  );
}

/** The rows of a README table that starts with `header`, as arrays of cells. */
function readmeTable(header) {
  const lines = read('README.md').split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(header));
  assert.ok(start >= 0, `README has the table ${header}`);
  const rows = [];
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i += 1)
    rows.push(tableCells(lines[i]));
  return rows;
}

const expected = () =>
  readmeTable('| Case | Check | Severity | File |').map(([cases, check, severity, file]) => ({
    cases: cases.match(/TC-BREV-\d{2}/g) ?? [],
    check: check.replace(/`/g, ''),
    severities: severity.split(' or '),
    file: file.replace(/`/g, ''),
  }));

/** Case id -> the spec file whose test is titled with it. */
function specOfCase() {
  const owner = new Map();
  for (const file of specs)
    for (const match of read(file).matchAll(/^test\(\s*['"`](TC-BREV-\d{2}) /gm))
      owner.set(match[1], file);
  return owner;
}

test('the markers seed exactly the checks the agent catalogues', () => {
  const checks = catalogue();
  assert.ok(checks.length >= 8, 'the agent lists its checks');
  const seeded = new Set(markers().map((entry) => entry.split(' ')[1]));
  assert.deepEqual([...seeded].sort(), [...checks].sort());
});

test('the expected findings match the markers, file by file', () => {
  const fromTable = expected().map((row) => `${row.file} ${row.check}`);
  assert.deepEqual(fromTable.sort(), markers().sort());
  for (const row of expected()) {
    assert.ok(row.cases.length > 0, `${row.check} in ${row.file} names its case`);
    for (const severity of row.severities) assert.ok(SEVERITIES.includes(severity), severity);
  }
});

test('the registry parses, and every case of the table and the specs is one of its cases', () => {
  const registry = parseRegistry(read('basket-review.md'), 'basket-review.md');
  assert.deepEqual(registry.problems, []);
  const ids = new Set(registry.cases.map((row) => row.id));
  const owner = specOfCase();
  assert.deepEqual(
    [...owner.keys()].filter((id) => !ids.has(id)),
    [],
  );
  assert.deepEqual(
    [...ids].filter((id) => !owner.has(id)),
    [],
    'every case has a test',
  );
  for (const row of expected()) for (const id of row.cases) assert.ok(ids.has(id), id);
});

test('the verdicts follow from the severities, whichever grade a borderline row takes', () => {
  const owner = specOfCase();
  const verdicts = Object.fromEntries(
    read('README.md')
      .split(/\r?\n/)
      .map((line) => /^- `([\w-]+\.spec\.ts)`: `(approve|changes|block)`$/.exec(line))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
  assert.deepEqual(Object.keys(verdicts).sort(), [...specs].sort());
  const verdictOf = (grades) =>
    grades.includes('blocker') ? 'block' : grades.includes('major') ? 'changes' : 'approve';
  for (const spec of specs) {
    const rows = expected().filter((row) => row.cases.some((id) => owner.get(id) === spec));
    const first = rows.map((row) => row.severities[0]);
    const last = rows.map((row) => row.severities.at(-1));
    assert.equal(verdictOf(first), verdicts[spec], `${spec} with the first grade of each row`);
    assert.equal(verdictOf(last), verdicts[spec], `${spec} with the last grade of each row`);
  }
});
