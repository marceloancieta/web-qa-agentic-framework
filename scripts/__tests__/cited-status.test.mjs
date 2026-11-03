import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { citationsIn, citedStatus, FIXTURES, RULES, runCitedStatus } from '../cited-status.mjs';
import { compareWithMarkers } from '../lib/lint.mjs';
import { createTracker } from '../tracker/adapters/local.mjs';

const KEY = 'BUG-\\d+';
const fixtureTracker = () => createTracker({ dir: 'tracker' }, { root: FIXTURES });

/** A tracker over a fixed set of issues, counting the reads. */
function fakeTracker(issues) {
  const reads = [];
  return {
    reads,
    async getIssue(key) {
      reads.push(key);
      return issues[key] ?? null;
    },
  };
}

/** Collects what the check prints. */
function output() {
  const lines = [];
  return { lines, log: (line) => lines.push(line) };
}

test('the fixture tree yields exactly its marked findings, for every rule', async () => {
  const { findings } = await citedStatus(FIXTURES, KEY, fixtureTracker());
  assert.deepEqual(compareWithMarkers(FIXTURES, findings), { missed: [], unexpected: [] });
  assert.deepEqual([...new Set(findings.map((f) => f.rule))].sort(), [...RULES].sort());
});

test('a finding names the row that cites the key, and each key is read once', async () => {
  const tracker = fakeTracker({
    'BUG-1': { status: 'open', category: 'open' },
    'BUG-2': { status: 'Resolved', category: 'done' },
    'BUG-3': { status: 'In review', category: 'in-progress' },
  });
  const { keys, findings } = await citedStatus(FIXTURES, KEY, tracker);
  assert.equal(keys, 4);
  assert.deepEqual(tracker.reads, ['BUG-1', 'BUG-2', 'BUG-3', 'BUG-9']);
  const messages = findings.map((f) => f.message);
  assert.ok(
    messages.some((m) => /^TC-BASKET-02 cites BUG-2: the issue is closed \("Resolved"\)/.test(m)),
  );
  assert.ok(messages.some((m) => /^G4 cites BUG-9: the tracker has no such issue/.test(m)));
  assert.ok(
    messages.some((m) => /^BUG-9: the tracker has no such issue/.test(m)),
    'prose has no row',
  );
});

test('a citation stands alone, outside code spans, code blocks and comments', () => {
  const text = [
    '| G1 | gap | look | BUG-1, BUG-12 |',
    'XBUG-2, BUG-2b, BUG-2-old, REQ-BUG-2 and `BUG-3` are not citations',
    '(BUG-4), BUG-5. and "BUG-6" are <!-- BUG-7 -->',
    '```',
    'BUG-8',
    '```',
    'BUG-9 and BUG-9',
  ].join('\n');
  assert.deepEqual(citationsIn(text, KEY), [
    { line: 1, key: 'BUG-1', row: 'G1' },
    { line: 1, key: 'BUG-12', row: 'G1' },
    { line: 3, key: 'BUG-4', row: null },
    { line: 3, key: 'BUG-5', row: null },
    { line: 3, key: 'BUG-6', row: null },
    { line: 7, key: 'BUG-9', row: null },
  ]);
});

test('exit codes: 1 on findings, 0 when every cited issue is open', async () => {
  const config = { tracker: { provider: 'local', key_pattern: KEY } };
  const findings = output();
  assert.equal(
    await runCitedStatus({ root: FIXTURES, config, load: fixtureTracker, out: findings }),
    1,
  );
  assert.match(findings.lines.at(-1), /^cited-status: 10 finding\(s\)\.$/);
  const allOpen = output();
  const open = { status: 'open', category: 'open' };
  const tracker = fakeTracker({ 'BUG-1': open, 'BUG-2': open, 'BUG-3': open, 'BUG-9': open });
  assert.equal(
    await runCitedStatus({ root: FIXTURES, config, load: () => tracker, out: allOpen }),
    0,
  );
  assert.deepEqual(allOpen.lines, [
    'cited-status: 4 key(s), cited 16 time(s) in 2 file(s), read in the local tracker.',
    'cited-status: clean.',
  ]);
});

test('--offline reads a tracker kept in the repository and skips one that needs the network', async () => {
  const unreachable = () => {
    throw new Error('the network was used');
  };
  const remote = output();
  const github = { tracker: { provider: 'github', key_pattern: '#\\d+' } };
  assert.equal(
    await runCitedStatus({
      root: FIXTURES,
      offline: true,
      config: github,
      load: unreachable,
      out: remote,
    }),
    0,
  );
  assert.match(remote.lines[0], /skipped, the github tracker needs the network/);
  const local = { tracker: { provider: 'local', key_pattern: KEY } };
  assert.equal(
    await runCitedStatus({
      root: FIXTURES,
      offline: true,
      config: local,
      load: fixtureTracker,
      out: output(),
    }),
    1,
  );
});

test('no tracker is not an error; a missing pattern or a tracker that fails stops with 2', async () => {
  const none = output();
  assert.equal(
    await runCitedStatus({ root: FIXTURES, config: { tracker: { provider: 'none' } }, out: none }),
    0,
  );
  assert.match(none.lines[0], /no tracker is configured/);
  const run = (tracker, load) =>
    runCitedStatus({ root: FIXTURES, config: { tracker }, load, out: output() });
  assert.equal(await run({ provider: 'local' }), 2, 'no key_pattern');
  assert.equal(await run({ provider: 'local', key_pattern: '([' }), 2, 'an invalid key_pattern');
  const failing = output();
  const down = {
    async getIssue() {
      throw new Error('connect ECONNREFUSED');
    },
  };
  assert.equal(
    await runCitedStatus({
      root: FIXTURES,
      config: { tracker: { provider: 'jira', key_pattern: KEY } },
      load: () => down,
      out: failing,
    }),
    2,
  );
  assert.match(failing.lines[0], /the jira tracker could not be read: connect ECONNREFUSED/);
});

test('the command reads the qa-config and the tracker of the tree it is given', () => {
  const cli = spawnSync(
    process.execPath,
    [join(import.meta.dirname, '..', 'cited-status.mjs'), '--root', FIXTURES, '--offline'],
    { encoding: 'utf8' },
  );
  assert.equal(cli.status, 1, cli.stderr);
  assert.match(
    cli.stdout,
    /apps\/shop\/registry\/basket\.md:23 {2}closed-key {2}TC-BASKET-02 cites BUG-2/,
  );
});
