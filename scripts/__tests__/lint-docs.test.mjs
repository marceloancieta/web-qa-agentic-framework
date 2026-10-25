import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import { compareWithMarkers } from '../lib/lint.mjs';
import {
  DERIVATION_PHRASES,
  FIXTURES,
  headingIds,
  lintDocs,
  RULES,
  wordingFindings,
} from '../lint-docs.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'lint-docs.mjs');
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

test('self-test: the fixture tree yields exactly its marked findings, for every rule', () => {
  const findings = lintDocs(FIXTURES);
  assert.deepEqual(compareWithMarkers(FIXTURES, findings), { missed: [], unexpected: [] });
  assert.deepEqual([...new Set(findings.map((f) => f.rule))].sort(), [...RULES].sort());
  assert.equal(run('--self-test').status, 0);
});

test('the repository has no findings', () => {
  assert.deepEqual(lintDocs(REPO_ROOT), []);
});

test('heading ids follow GitHub: punctuation dropped, spaces to hyphens, repeats numbered', () => {
  const ids = headingIds(
    '# A\n## 1.1 Tool: Playwright with TypeScript\n## Setup\n## Setup\n```\n## Not a heading\n```\n',
  );
  assert.deepEqual([...ids], ['a', '11-tool-playwright-with-typescript', 'setup', 'setup-1']);
});

test('every phrase is found with extra spaces, in any case, and only as whole words', () => {
  for (const phrase of DERIVATION_PHRASES) {
    const spaced = phrase.replace(' ', '  ').toUpperCase();
    assert.equal(wordingFindings(`It was ${spaced} it.`).length, 1, phrase);
    assert.equal(wordingFindings(`a "${phrase}" mention`).length, 0, phrase);
  }
  assert.deepEqual(wordingFindings('reporting, supported, imported from npm'), []);
});

test('commit messages: exit 1 with the line, 0 when clean', () => {
  const dir = mkdtempSync(join(tmpdir(), 'msg-'));
  const bad = join(dir, 'bad.txt');
  writeFileSync(
    bad,
    `feat(core): CORE-1 helpers\n\nThe helpers are ${DERIVATION_PHRASES[3]} the old tool.\n`,
  );
  const good = join(dir, 'good.txt');
  writeFileSync(good, 'feat(core): CORE-1 helpers\n\nReporting helpers for the run.\n');
  const failed = run('--message', bad);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /commit message:3 {2}public-wording/);
  assert.equal(run('--message', good).status, 0);
});
