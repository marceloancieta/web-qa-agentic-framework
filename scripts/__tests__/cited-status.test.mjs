import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  baselineCitations,
  citationsIn,
  citedStatus,
  FIXTURES,
  knownGapCitations,
  RULES,
  runCitedStatus,
} from '../cited-status.mjs';
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

/** A tree of the given files under a temporary root, removed after `use`. */
async function withTree(files, use) {
  const root = mkdtempSync(join(tmpdir(), 'cited-status-'));
  try {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    }
    return await use(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
  assert.deepEqual(tracker.reads, ['BUG-1', 'BUG-2', 'BUG-3', 'BUG-9'], 'BUG-three is not sent');
  const messages = findings.map((f) => f.message);
  assert.ok(
    messages.some((m) => /^TC-BASKET-02 cites BUG-2: the issue is closed \("Resolved"\)/.test(m)),
  );
  assert.ok(messages.some((m) => /^G4 cites BUG-9: the tracker has no such issue/.test(m)));
  assert.ok(
    messages.some((m) => /^BUG-9: the tracker has no such issue/.test(m)),
    'prose has no row',
  );
  const at = (file, line) => findings.find((f) => f.file === file && f.line === line).message;
  assert.match(at('apps/shop/specs/basket.spec.ts', 11), /^TC-BASKET-02 cites BUG-2: /);
  assert.match(at('apps/shop/specs/basket.spec.ts', 33), /^TC-BASKET-08: knownGap takes its key/);
  assert.match(at('apps/shop/docs/app-notes.md', 6), /^BUG-2: /, 'a note names no row');
  assert.match(at('apps/shop/a11y-known.json', 3), /^BUG-2: /);
  assert.match(at('apps/shop/headers-known.json', 2), /^BUG-2: /);
  assert.match(at('apps/shop/zap-known.json', 3), /^BUG-9: the tracker has no such issue/);
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

test('a knownGap citation is the first argument of the call, read from the syntax tree', () => {
  const text = [
    "test('TC-A-01 first', async () => {",
    "  test.fail(true, await knownGap('BUG-1', 'on one line'));",
    '  test.fail(',
    '    true,',
    '    await knownGap(',
    "      'BUG-2',",
    "      'on several lines: the line of the key, not of the call',",
    '    ),',
    '  );',
    '});',
    "test('no case id here', async () => {",
    '  test.fail(true, await knownGap(`BUG-3`, why));',
    '  await knownGap(key, why);',
    '  await knownGap();',
    '});',
    "// knownGap('BUG-4', 'a comment')",
    "const quoted = \"knownGap('BUG-5', 'a string')\";",
    "page.knownGap('BUG-6', 'a method');",
    "notKnownGap('BUG-7', 'another function');",
    "const key = 'BUG-8';",
    'async function knownGap(key, why) {}',
  ].join('\n');
  assert.deepEqual(knownGapCitations(text), [
    { line: 2, key: 'BUG-1', row: 'TC-A-01' },
    { line: 6, key: 'BUG-2', row: 'TC-A-01' },
    { line: 12, key: 'BUG-3', row: null },
    { line: 13, key: null, row: null },
    { line: 14, key: null, row: null },
  ]);
});

test('a baseline citation is the key field of an entry, wherever the entry is laid out', () => {
  const text = [
    '[',
    '  { "rule": "a", "key": "BUG-1", "note": "BUG-2 is mentioned" },',
    '  {',
    '    "rule": "b",',
    '    "note": "\\"key\\": \\"BUG-3\\" in a text",',
    '    "key": "BUG-4"',
    '  },',
    '  { "rule": "c" },',
    '  { "rule": "d", "key": "" },',
    '  { "rule": "e", "key": 7 },',
    '  "BUG-5",',
    '  { "nested": { "key": "BUG-6" } }',
    ']',
  ].join('\r\n');
  assert.deepEqual(baselineCitations(text), [
    { line: 2, key: 'BUG-1', row: null },
    { line: 6, key: 'BUG-4', row: null },
  ]);
  assert.deepEqual(baselineCitations('[]\n'), []);
});

test('a pack may lack any source, and the keys of every source are read', async () => {
  const open = { status: 'open', category: 'open' };
  await withTree(
    {
      'apps/empty/README.md': 'BUG-7\n',
      'apps/shop/docs/features/basket.md': 'waits on BUG-1\n',
      'apps/shop/docs/app-notes.md': 'defect BUG-2\n',
      'apps/shop/a11y-known.json': '[{ "key": "BUG-3" }]\n',
      'apps/shop/specs/nested/deep/basket.spec.ts': "await knownGap('BUG-4', 'why');\n",
      'apps/shop/specs/nested/helper.ts': "await knownGap('BUG-5', 'not a spec file');\n",
      'apps/stray.md': 'a file beside the packs is not a pack: BUG-6\n',
    },
    async (root) => {
      const tracker = fakeTracker({ 'BUG-1': open, 'BUG-2': open, 'BUG-3': open, 'BUG-4': open });
      const out = output();
      const config = { tracker: { provider: 'local', key_pattern: KEY } };
      assert.equal(await runCitedStatus({ root, config, load: () => tracker, out }), 0);
      assert.deepEqual(tracker.reads, ['BUG-1', 'BUG-2', 'BUG-3', 'BUG-4']);
      assert.deepEqual(out.lines, [
        'cited-status: 4 key(s), cited 4 time(s) in 4 file(s), read in the local tracker.',
        'cited-status: clean.',
      ]);
    },
  );
});

test('a baseline that cannot be read stops with 2, names the file and asks no tracker', async () => {
  const unreachable = () => {
    throw new Error('the tracker was used');
  };
  const config = { tracker: { provider: 'local', key_pattern: KEY } };
  for (const [text, problem] of [
    ['[{ "key": ', /a11y-known\.json is not JSON/],
    ['{ "key": "BUG-1" }', /a11y-known\.json is not a list of entries/],
  ]) {
    await withTree({ 'apps/shop/a11y-known.json': text }, async (root) => {
      const out = output();
      assert.equal(await runCitedStatus({ root, config, load: unreachable, out }), 2);
      assert.match(out.lines[0], /^cited-status: the citations could not be read: /);
      assert.match(out.lines[0], problem);
    });
  }
});

test('exit codes: 1 on findings, and every issue open leaves only what no tracker settles', async () => {
  const config = { tracker: { provider: 'local', key_pattern: KEY } };
  const findings = output();
  assert.equal(
    await runCitedStatus({ root: FIXTURES, config, load: fixtureTracker, out: findings }),
    1,
  );
  assert.match(findings.lines.at(-1), /^cited-status: 23 finding\(s\)\.$/);
  const allOpen = output();
  const open = { status: 'open', category: 'open' };
  const tracker = fakeTracker({ 'BUG-1': open, 'BUG-2': open, 'BUG-3': open, 'BUG-9': open });
  assert.equal(
    await runCitedStatus({ root: FIXTURES, config, load: () => tracker, out: allOpen }),
    1,
  );
  assert.equal(
    allOpen.lines[0],
    'cited-status: 4 key(s), cited 32 time(s) in 7 file(s), read in the local tracker.',
  );
  assert.deepEqual(
    allOpen.lines.slice(1, -1).map((line) => line.split('  ').slice(0, 2).join(' ')),
    [
      'apps/shop/a11y-known.json:5 unknown-key',
      'apps/shop/specs/basket.spec.ts:29 unknown-key',
      'apps/shop/specs/basket.spec.ts:33 dynamic-key',
      'apps/shop/specs/basket.spec.ts:37 dynamic-key',
    ],
  );
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

test('--online reads a tracker reached over the network and skips one kept in the repository', async () => {
  const unreachable = () => {
    throw new Error('the tracker was used');
  };
  const local = output();
  assert.equal(
    await runCitedStatus({
      root: FIXTURES,
      online: true,
      config: { tracker: { provider: 'local', key_pattern: KEY } },
      load: unreachable,
      out: local,
    }),
    0,
  );
  assert.deepEqual(local.lines, [
    'cited-status: skipped, the local tracker is kept in the repository, so `npm run gates` reads it; no tracker was read here.',
  ]);
  const closed = { status: 'closed', category: 'done' };
  for (const provider of ['github', 'jira']) {
    const tracker = fakeTracker({ 'BUG-1': closed, 'BUG-2': closed, 'BUG-3': closed });
    const out = output();
    assert.equal(
      await runCitedStatus({
        root: FIXTURES,
        online: true,
        config: { tracker: { provider, key_pattern: KEY } },
        load: () => tracker,
        out,
      }),
      1,
      provider,
    );
    assert.deepEqual(tracker.reads, ['BUG-1', 'BUG-2', 'BUG-3', 'BUG-9'], provider);
    assert.match(out.lines[0], new RegExp(`read in the ${provider} tracker`));
  }
  const none = output();
  assert.equal(
    await runCitedStatus({
      root: FIXTURES,
      online: true,
      config: { tracker: { provider: 'none' } },
      load: unreachable,
      out: none,
    }),
    0,
  );
  assert.match(none.lines[0], /no tracker is configured/);
});

test('--online does not pass quietly when the network tracker cannot be read', async () => {
  const noCredential = () => {
    throw new Error('The jira tracker needs JIRA_TOKEN');
  };
  const out = output();
  assert.equal(
    await runCitedStatus({
      root: FIXTURES,
      online: true,
      config: { tracker: { provider: 'jira', key_pattern: KEY } },
      load: noCredential,
      out,
    }),
    2,
  );
  assert.match(
    out.lines[0],
    /the jira tracker could not be read: The jira tracker needs JIRA_TOKEN/,
  );
});

test('--offline and --online together are refused', async () => {
  const out = output();
  assert.equal(
    await runCitedStatus({
      root: FIXTURES,
      offline: true,
      online: true,
      config: { tracker: { provider: 'local', key_pattern: KEY } },
      out,
    }),
    2,
  );
  assert.match(out.lines[0], /--offline and --online exclude each other/);
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
  const online = spawnSync(
    process.execPath,
    [join(import.meta.dirname, '..', 'cited-status.mjs'), '--root', FIXTURES, '--online'],
    { encoding: 'utf8' },
  );
  assert.equal(online.status, 0, online.stderr);
  assert.match(online.stdout, /skipped, the local tracker is kept in the repository/);
});
