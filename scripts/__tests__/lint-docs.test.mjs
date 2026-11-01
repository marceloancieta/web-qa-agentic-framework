import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import { gitEnv } from '../lib/git.mjs';
import { compareWithMarkers } from '../lib/lint.mjs';
import {
  BACKLOG,
  closingCommits,
  DERIVATION_PHRASES,
  FIXTURES,
  headingIds,
  historyWordingFindings,
  lintDocs,
  RULES,
  SELF_TEST_HISTORY,
  wordingFindings,
} from '../lint-docs.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'lint-docs.mjs');
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

test('self-test: the fixture tree yields exactly its marked findings, for every rule', () => {
  const findings = lintDocs(FIXTURES, { history: SELF_TEST_HISTORY });
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

test('closing commits: only the Closed by column of the Done table is read', () => {
  const backlog = [
    '## Done',
    '',
    '| Id | Closed by | Item |',
    '|---|---|---|',
    '| A-01 | `abcdef1`, `ABCDEF2` | names `1234567` |',
    '',
    '## Later',
    '',
    '| Id | Closed by |',
    '|---|---|',
    '| B-01 | `7654321` |',
  ].join('\n');
  assert.deepEqual(closingCommits(backlog), [
    { hash: 'abcdef1', line: 5 },
    { hash: 'abcdef2', line: 5 },
  ]);
});

/** A throwaway repository with its own identity; the working repository is never touched. */
function tempRepository() {
  const dir = mkdtempSync(join(tmpdir(), 'lint-docs-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, env: gitEnv(), encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Lint Docs Test');
  git('config', 'user.email', 'lint-docs-test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  const commit = (message) => {
    git('commit', '-q', '--allow-empty', '--no-verify', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  return { dir, git, commit };
}

test('closing commits are read from the history of HEAD, not from other branches', () => {
  const { dir, git, commit } = tempRepository();
  const merged = commit('feat(core): CORE-01 merged');
  git('checkout', '-q', '-b', 'side');
  const unmerged = commit('feat(core): CORE-02 never merged');
  git('checkout', '-q', 'main');

  mkdirSync(join(dir, 'docs'));
  writeFileSync(
    join(dir, BACKLOG),
    [
      '# Backlog',
      '',
      '## Done',
      '',
      '| Id | Item | Closed by |',
      '|---|---|---|',
      `| CORE-01 | Merged. | \`${merged.slice(0, 7)}\` |`,
      `| CORE-02 | On a branch that was never merged. | \`${unmerged.slice(0, 7)}\` |`,
      '| CORE-03 | A typo. | `0000000` |',
      '',
    ].join('\n'),
  );

  const findings = lintDocs(dir).filter((f) => f.rule === 'closing-commit');
  assert.deepEqual(
    findings.map((f) => [f.file, f.line]),
    [
      [BACKLOG, 8],
      [BACKLOG, 9],
    ],
  );
  assert.match(findings[0].message, new RegExp(`cites ${unmerged.slice(0, 7)}`));
});

test('closing commits: a shallow clone stops the linter instead of reporting', () => {
  const { dir, commit } = tempRepository();
  const first = commit('feat(core): CORE-01 first');
  commit('feat(core): CORE-02 second');
  const shallow = mkdtempSync(join(tmpdir(), 'lint-docs-shallow-'));
  execFileSync('git', ['clone', '-q', '--depth', '1', `file://${dir}`, shallow], {
    env: gitEnv(),
  });
  mkdirSync(join(shallow, 'docs'));
  writeFileSync(
    join(shallow, BACKLOG),
    `## Done\n\n| Id | Closed by |\n|---|---|\n| CORE-01 | \`${first.slice(0, 7)}\` |\n`,
  );
  assert.throws(() => lintDocs(shallow), /shallow/);
  const outcome = run('--root', shallow);
  assert.equal(outcome.status, 2);
  assert.match(outcome.stderr, /lint-docs: .*shallow/);
});

test('history: public-wording reads every commit message of HEAD, quoted mentions pass', () => {
  const { dir, git, commit } = tempRepository();
  commit('feat(core): CORE-01 helpers');
  const bad = commit(
    `feat(core): CORE-02 runner\n\nThe runner is ${DERIVATION_PHRASES[1]} a tool.`,
  );
  commit(`docs: DOC-01 the rule reports "${DERIVATION_PHRASES[1]}" as a phrase`);
  git('checkout', '-q', '-b', 'side');
  commit(`docs: DOC-02 ${DERIVATION_PHRASES[0]} on a branch that is not HEAD's history`);
  git('checkout', '-q', 'main');

  assert.deepEqual(historyWordingFindings(dir), [
    { commit: bad.slice(0, 7), line: 3, phrase: DERIVATION_PHRASES[1] },
  ]);
  const outcome = run('--history', '--root', dir);
  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, new RegExp(`commit ${bad.slice(0, 7)}:3 {2}public-wording`));

  const clean = tempRepository();
  clean.commit('feat(core): CORE-01 reporting helpers');
  assert.equal(run('--history', '--root', clean.dir).status, 0);
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
