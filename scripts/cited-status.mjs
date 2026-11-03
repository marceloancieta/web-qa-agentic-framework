#!/usr/bin/env node
/**
 * Cited status: every tracker key the registries and the feature contracts cite, read in the
 * configured tracker. A key stands for a known gap, a claim that waits on a fix ("red today",
 * "until <KEY> is fixed") or a workaround; once its issue is closed, what cites it may be stale.
 *
 *   closed-key    the cited issue is done: the gap may be fixed, so the case, the claim or the
 *                 workaround that cites it is revisited (qa-design, or the known-gap lane first).
 *   unknown-key   the tracker has no such issue: a mistyped key, or one deleted or moved.
 *
 * A citation is a match of qa-config `tracker.key_pattern` in `apps/<pack>/registry/*.md` or
 * `apps/<pack>/docs/features/*.md`, standing alone (not part of a longer word), outside code spans,
 * fenced code blocks and HTML comments, which hold examples and reviewer notes. Each key is read
 * once, and only read: nothing is written to the tracker.
 *
 *   node scripts/cited-status.mjs                the configured tracker
 *   node scripts/cited-status.mjs --offline      only a tracker kept in the repository (`local`);
 *                                                any other is skipped with a note (the gates)
 *   node scripts/cited-status.mjs --root <dir>   another tree, with its own qa-config
 *
 * Exit codes: 0 every cited issue is open or in progress, no tracker is configured, or --offline
 * met a tracker that needs the network; 1 findings; 2 the check could not run (no key pattern, an
 * unknown provider, a tracker that did not answer).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './lib/cli.mjs';
import { loadLocalEnv } from './lib/env.mjs';
import { finding, report } from './lib/lint.mjs';
import { readConfig } from './lib/qa-config.mjs';
import { loadRegistries } from './lib/registry.mjs';
import { tableCells, withoutHtmlComments } from './lib/text.mjs';
import { loadTracker } from './tracker/index.mjs';

export const TOOL = 'cited-status';
export const RULES = ['closed-key', 'unknown-key'];
export const FIXTURES = join(import.meta.dirname, '__fixtures__', 'cited-status');
/** Trackers whose issues are a file in the repository, so reading them needs no network. */
export const OFFLINE_PROVIDERS = ['local'];

const FENCE = /^\s*(```|~~~)/;

/** The registries and contracts of every pack, as repository-relative paths. */
function citingFiles(root) {
  const files = new Set(loadRegistries(root).map((registry) => registry.file));
  const apps = join(root, 'apps');
  if (existsSync(apps)) {
    for (const pack of readdirSync(apps).sort()) {
      const dir = join(apps, pack, 'docs', 'features');
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir).filter((n) => n.endsWith('.md')))
        files.add(`apps/${pack}/docs/features/${name}`);
    }
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

/** Every citation of the registries and contracts under `root`, with its file. */
export function citations(root, keyPattern) {
  return citingFiles(root).flatMap((file) =>
    citationsIn(readFileSync(join(root, file), 'utf8'), keyPattern).map((c) => ({ file, ...c })),
  );
}

/**
 * The citations and the findings. Each key is read once through `tracker.getIssue`, which answers
 * null for a key the tracker lacks. A tracker that throws stops the check; the caller gets the error.
 */
export async function citedStatus(root, keyPattern, tracker) {
  const cited = citations(root, keyPattern);
  const issues = new Map();
  for (const key of [...new Set(cited.map((c) => c.key))].sort())
    issues.set(key, await tracker.getIssue(key));
  const findings = [];
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
  config = readConfig(root).config,
  load = (trackerConfig) => loadTracker(trackerConfig, { root }),
  out = console,
} = {}) {
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
  let result;
  try {
    result = await citedStatus(root, tracker.key_pattern, await load(tracker));
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
      root: { type: 'string' },
    },
  });
  const root = resolve(values.root ?? REPO_ROOT);
  if (!values.offline) loadLocalEnv(root);
  process.exitCode = await runCitedStatus({ root, offline: values.offline });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
