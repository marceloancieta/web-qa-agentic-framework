#!/usr/bin/env node
/**
 * Cited status: every tracker key an application pack cites, read in the configured tracker. A key
 * stands for a known gap, a claim that waits on a fix ("red today", "until <KEY> is fixed") or a
 * workaround; once its issue is closed, what cites it may be stale.
 *
 *   closed-key    the cited issue is done: the gap may be fixed, so the case, the claim or the
 *                 workaround that cites it is revisited (qa-design, or the known-gap lane first).
 *   unknown-key   the tracker has no such issue: a mistyped key, or one deleted or moved.
 *   dynamic-key   a `knownGap` call takes its key from an expression, so nothing here can read it.
 *
 * What cites, for each pack under `apps/`:
 *
 *   registry/*.md, docs/features/*.md and docs/app-notes.md: a match of qa-config
 *     `tracker.key_pattern` standing alone (not part of a longer word), outside code spans, fenced
 *     code blocks and HTML comments, which hold examples and reviewer notes.
 *   specs/**\/*.spec.ts: the first argument of a `knownGap(...)` call, read through the syntax tree.
 *     Comments, strings, a `test.fail` reason of its own and a method of that name do not count.
 *   a11y-known.json, headers-known.json, zap-known.json: the `key` field of each entry. A key
 *     mentioned in another field does not count.
 *
 * In a spec and a baseline the position says what the key is, so a value that does not match the
 * pattern is an `unknown-key` and goes to no tracker. Each key is read once, and only read: nothing
 * is written to the tracker.
 *
 *   node scripts/cited-status.mjs                the configured tracker
 *   node scripts/cited-status.mjs --offline      only a tracker kept in the repository (`local`);
 *                                                any other is skipped with a note (the gates)
 *   node scripts/cited-status.mjs --online       only a tracker reached over the network; one kept
 *                                                in the repository is skipped with a note (the
 *                                                scheduled run, since the gates already read it)
 *   node scripts/cited-status.mjs --root <dir>   another tree, with its own qa-config
 *
 * Exit codes: 0 every cited issue is open or in progress, no tracker is configured, or the tracker
 * is one this run skips; 1 findings; 2 the check could not run (no key pattern, an unknown provider,
 * a baseline that cannot be read, a tracker that did not answer, --offline with --online).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './lib/cli.mjs';
import { literalText, specFilesUnder, testsIn, ts } from './lib/corpus.mjs';
import { loadLocalEnv } from './lib/env.mjs';
import { finding, report } from './lib/lint.mjs';
import { readConfig } from './lib/qa-config.mjs';
import { loadRegistries } from './lib/registry.mjs';
import { tableCells, withoutHtmlComments } from './lib/text.mjs';
import { loadTracker } from './tracker/index.mjs';

export const TOOL = 'cited-status';
export const RULES = ['closed-key', 'unknown-key', 'dynamic-key'];
export const FIXTURES = join(import.meta.dirname, '__fixtures__', 'cited-status');
/** Trackers whose issues are a file in the repository, so reading them needs no network. */
export const OFFLINE_PROVIDERS = ['local'];
/** The baselines of a pack whose entries cite a key in their `key` field. */
export const CITING_BASELINES = ['a11y-known.json', 'headers-known.json', 'zap-known.json'];

const FENCE = /^\s*(```|~~~)/;
const KNOWN_GAP = 'knownGap';

/** The packs under `root`, by name. */
function packsOf(root) {
  const apps = join(root, 'apps');
  if (!existsSync(apps)) return [];
  return readdirSync(apps, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** The registries and contracts of every pack, as repository-relative paths. */
function citingFiles(root, packs) {
  const files = new Set(loadRegistries(root).map((registry) => registry.file));
  for (const pack of packs) {
    const dir = join(root, 'apps', pack, 'docs', 'features');
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.md')))
      files.add(`apps/${pack}/docs/features/${name}`);
  }
  return [...files].sort();
}

/** A key pattern that matches only a key standing alone, not a piece of a longer word. */
export function citationPattern(keyPattern) {
  return new RegExp(`(?<![\\w-])(?:${keyPattern})(?![\\w-])`, 'g');
}

/**
 * The keys one Markdown text cites, `{ line, key, row }`, once per key and line. `row` is the first
 * cell of the table row the key sits in (a case id, a gap, a rule), or null in prose.
 */
export function citationsIn(text, keyPattern) {
  const pattern = citationPattern(keyPattern);
  const found = [];
  let fenced = false;
  text.split(/\r?\n/).forEach((raw, index) => {
    if (FENCE.test(raw)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const line = withoutHtmlComments(raw).replace(/`[^`]*`/g, ' ');
    const keys = [...new Set(line.match(pattern) ?? [])];
    if (keys.length === 0) return;
    const row = line.trim().startsWith('|') ? tableCells(line)[0] || null : null;
    for (const key of keys) found.push({ line: index + 1, key, row });
  });
  return found;
}

/**
 * The keys the `knownGap` calls of one spec cite, `{ line, key, row }`, on the line of the key.
 * `row` is the case id of the test around the call, or null; `key` is null when the call takes it
 * from an expression.
 */
export function knownGapCitations(text, file = 'cited.spec.ts') {
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const tests = testsIn(sourceFile);
  const found = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === KNOWN_GAP
    ) {
      const [argument] = node.arguments;
      const start = (argument ?? node).getStart(sourceFile);
      const owner = tests.find(({ call }) => call.pos <= node.pos && node.end <= call.end);
      found.push({
        line: sourceFile.getLineAndCharacterOfPosition(start).line + 1,
        key: literalText(argument),
        row: owner?.id ?? null,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/**
 * The keys the entries of one baseline cite in their `key` field, `{ line, key, row }`. An entry
 * without one is left to the fixture that loads the baseline, which refuses it. Text that is not a
 * list of entries throws: nothing could be read from it.
 */
export function baselineCitations(text, file = 'a11y-known.json') {
  let entries;
  try {
    entries = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} is not JSON: ${error.message}`, { cause: error });
  }
  if (!Array.isArray(entries)) throw new Error(`${file} is not a list of entries.`);
  const sourceFile = ts.parseJsonText(file, text);
  return sourceFile.statements[0].expression.elements.flatMap((entry) => {
    if (!ts.isObjectLiteralExpression(entry)) return [];
    const field = entry.properties.find((property) => literalText(property.name) === 'key');
    const key = literalText(field?.initializer);
    if (!key) return [];
    const start = field.initializer.getStart(sourceFile);
    return [{ line: sourceFile.getLineAndCharacterOfPosition(start).line + 1, key, row: null }];
  });
}

/** Every citation of the packs under `root`, with its file. Throws on a baseline it cannot read. */
export function citations(root, keyPattern) {
  const packs = packsOf(root);
  const read = (file) => readFileSync(join(root, file), 'utf8');
  const present = (file) => existsSync(join(root, file));
  const withFile = (file, found) => found.map((c) => ({ file, ...c }));
  const notes = packs.map((pack) => `apps/${pack}/docs/app-notes.md`).filter(present);
  const specs = packs.flatMap((pack) =>
    specFilesUnder(join(root, 'apps', pack, 'specs'), `apps/${pack}/specs`),
  );
  const baselines = packs
    .flatMap((pack) => CITING_BASELINES.map((name) => `apps/${pack}/${name}`))
    .filter(present);
  return [
    ...citingFiles(root, packs).flatMap((file) =>
      withFile(file, citationsIn(read(file), keyPattern)),
    ),
    // The first cell of a note is a sentence about the application, not a name for it.
    ...notes.flatMap((file) =>
      withFile(
        file,
        citationsIn(read(file), keyPattern).map((c) => ({ ...c, row: null })),
      ),
    ),
    ...specs.flatMap((file) => withFile(file, knownGapCitations(read(file), file))),
    ...baselines.flatMap((file) => withFile(file, baselineCitations(read(file), file))),
  ];
}

/**
 * The citations and the findings. Each key is read once through `tracker.getIssue`, which answers
 * null for a key the tracker lacks; a value that does not match the pattern is never sent to it. A
 * tracker that throws stops the check; the caller gets the error.
 */
export async function citedStatus(root, keyPattern, tracker, found = citations(root, keyPattern)) {
  const cited = found.filter((c) => c.key !== null);
  const wholeKey = new RegExp(`^(?:${keyPattern})$`);
  const issues = new Map();
  for (const key of [...new Set(cited.map((c) => c.key))].filter((k) => wholeKey.test(k)).sort())
    issues.set(key, await tracker.getIssue(key));
  const findings = found
    .filter((c) => c.key === null)
    .map(({ file, line, row }) =>
      finding(
        'dynamic-key',
        file,
        line,
        `${row ? `${row}: ` : ''}${KNOWN_GAP} takes its key from an expression, so it cannot be checked; write the key in the call`,
      ),
    );
  for (const { file, line, key, row } of cited) {
    const issue = issues.get(key);
    const where = row ? `${row} cites ${key}` : key;
    if (!issue)
      findings.push(
        finding(
          'unknown-key',
          file,
          line,
          `${where}: the tracker has no such issue; correct the key, or name the issue that replaced it`,
        ),
      );
    else if (issue.category === 'done')
      findings.push(
        finding(
          'closed-key',
          file,
          line,
          `${where}: the issue is closed ("${issue.status}"); the gap may be fixed, so revisit what cites it`,
        ),
      );
  }
  return { cited, keys: issues.size, findings };
}

/** The check from the command line's options; returns the exit code. */
export async function runCitedStatus({
  root = REPO_ROOT,
  offline = false,
  online = false,
  config = readConfig(root).config,
  load = (trackerConfig) => loadTracker(trackerConfig, { root }),
  out = console,
} = {}) {
  if (offline && online) {
    out.log(`${TOOL}: --offline and --online exclude each other; pick the one this run is for.`);
    return 2;
  }
  const tracker = config.tracker ?? {};
  const provider = tracker.provider ?? 'none';
  if (provider === 'none') {
    out.log(`${TOOL}: no tracker is configured (tracker.provider is none); nothing to check.`);
    return 0;
  }
  if (offline && !OFFLINE_PROVIDERS.includes(provider)) {
    out.log(
      `${TOOL}: skipped, the ${provider} tracker needs the network; run \`npm run cited-status\` where it answers.`,
    );
    return 0;
  }
  if (online && OFFLINE_PROVIDERS.includes(provider)) {
    out.log(
      `${TOOL}: skipped, the ${provider} tracker is kept in the repository, so \`npm run gates\` reads it; no tracker was read here.`,
    );
    return 0;
  }
  if (typeof tracker.key_pattern !== 'string' || !tracker.key_pattern) {
    out.log(`${TOOL}: qa-config tracker.key_pattern is not set, so no citation can be found.`);
    return 2;
  }
  try {
    citationPattern(tracker.key_pattern);
  } catch (error) {
    out.log(`${TOOL}: qa-config tracker.key_pattern is not a valid pattern: ${error.message}`);
    return 2;
  }
  let found;
  try {
    found = citations(root, tracker.key_pattern);
  } catch (error) {
    out.log(`${TOOL}: the citations could not be read: ${error.message}`);
    return 2;
  }
  let result;
  try {
    result = await citedStatus(root, tracker.key_pattern, await load(tracker), found);
  } catch (error) {
    out.log(
      `${TOOL}: the ${provider} tracker could not be read: ${error.message}. Check qa-config tracker and the variables it names, then run again.`,
    );
    return 2;
  }
  const files = new Set(result.cited.map((c) => c.file)).size;
  out.log(
    `${TOOL}: ${result.keys} key(s), cited ${result.cited.length} time(s) in ${files} file(s), read in the ${provider} tracker.`,
  );
  return report(TOOL, result.findings, out);
}

async function main() {
  const { values } = parseArgs({
    options: {
      offline: { type: 'boolean', default: false },
      online: { type: 'boolean', default: false },
      root: { type: 'string' },
    },
  });
  const root = resolve(values.root ?? REPO_ROOT);
  if (!values.offline) loadLocalEnv(root);
  process.exitCode = await runCitedStatus({ root, offline: values.offline, online: values.online });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
