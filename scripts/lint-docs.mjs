#!/usr/bin/env node
// Documentation linter. The docs are read by people and by agents, so a link that leads nowhere or a
// claim the repository should never make costs as much as a code defect.
//
//   broken-link     a relative Markdown link (`[text](path)`, `[text](path#anchor)`, `[text](#anchor)`)
//                   whose file does not exist, or whose anchor is not a heading of the target
//                   (GitHub's heading ids). Links inside code are not read.
//   broken-reference  in a rule (`.claude/rules/*.md`) or a skill (`.claude/skills/*/SKILL.md`), a
//                   path in inline code (`scripts/lib/registry.mjs`, `helpers/case-meta.ts:12`) that
//                   names no file, from the repository root, from the file or from a pack
//                   (`docs/app-map.json` in a table of what a pack holds). Only paths with a
//                   folder and an extension are read; placeholders (`apps/<pack>/app.json`), globs,
//                   folders and paths under the ignored output folders above are not.
//   host-in-notes   a hand-written note of a pack (`apps/<pack>/docs/**/*.md`) that writes the base
//                   URL of an environment (any `base_url` of qa-config.example.json, or
//                   `localhost:<port>`) instead of `<base_url>`: notes outlive environments.
//   public-wording  in any text file, a phrase that presents the framework as taken from another
//                   codebase. A phrase in quotes or backticks is a mention, not a claim, and passes;
//                   so does LICENSE, whose text is fixed.
//   closing-commit  in `docs/backlog.md`, a hash in the **Closed by** column of the **Done** table
//                   that names no commit in the history of `HEAD`: a typo, a commit of a branch that
//                   was never merged, or one a rewritten history dropped. The history is read with
//                   `git rev-list HEAD`; a shallow clone cannot answer, so the linter stops (exit 2).
//
// Usage:
//   node scripts/lint-docs.mjs [--root <dir>]     every file of the repository, or another tree
//   node scripts/lint-docs.mjs --message <file>   public-wording on a commit message (commit-msg)
//   node scripts/lint-docs.mjs --history [--root <dir>]
//                                                 public-wording on every commit message in the
//                                                 history of HEAD; a shallow clone stops it (exit 2)
//   node scripts/lint-docs.mjs --self-test        exact check against the fixture tree
// Exit codes: 0 clean; 1 findings or an inexact self-test; 2 the linter could not run.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './lib/cli.mjs';
import { gitEnv } from './lib/git.mjs';
import { finding, report, selfTest } from './lib/lint.mjs';
import { describeExit, spawnFailure } from './lib/spawn.mjs';
import { withoutHtmlComments } from './lib/text.mjs';

export const TOOL = 'lint-docs';
export const FIXTURES = join(import.meta.dirname, '__fixtures__', 'lint-docs');
export const RULES = [
  'broken-link',
  'broken-reference',
  'closing-commit',
  'host-in-notes',
  'public-wording',
];
export const BACKLOG = 'docs/backlog.md';
// The history the fixture tree is checked against, so the self-test never depends on the commits
// of this repository.
export const SELF_TEST_HISTORY = [
  'aaaaaaa1111111111111111111111111111111aa',
  'ccccccc2222222222222222222222222222222cc',
];

const SKIPPED_DIRS = new Set([
  'node_modules',
  '.git',
  '__fixtures__',
  'test-results',
  'playwright-report',
  'blob-report',
  'allure-results',
  'allure-report',
  'reports',
  '.auth',
  'worktrees',
  '.stryker-tmp',
]);
const TEXT_FILE = /\.(?:md|ts|mts|mjs|js|json|ya?ml|txt)$|^(?:NOTICE|LICENSE|\.env\.example)$/;
const NOTES_FILE = /^apps\/[^/]+\/docs\/.+\.md$/;
const AGENT_FILE = /^\.claude\/(?:rules\/[^/]+|skills\/[^/]+\/SKILL)\.md$/;
const PATH_LIKE = /^\.?[\w.-]+(?:\/[\w.@-]+)+$/;
const FIXED_TEXT = new Set(['LICENSE']);

// Built from parts, so this list is not itself a finding of the rule it defines.
export const DERIVATION_PHRASES = [
  ['prede', 'cessor'],
  ['ported', ' from'],
  ['port', 'ed over'],
  ['copied', ' from'],
  ['based on an', ' earlier'],
  ['carried', ' over'],
  ['derived', ' from'],
].map((parts) => parts.join(''));
const DERIVATION = new RegExp(
  `\\b(?:${DERIVATION_PHRASES.join('|').replace(/ /g, '\\s+')})\\b`,
  'i',
);

/** Every text file under `root`, as forward-slash paths relative to it. */
function textFiles(root, dir = '') {
  const here = join(root, dir);
  return readdirSync(here, { withFileTypes: true }).flatMap((entry) => {
    if (SKIPPED_DIRS.has(entry.name)) return [];
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return textFiles(root, path);
    return TEXT_FILE.test(entry.name) ? [path] : [];
  });
}

/** Markdown with fenced blocks and inline code blanked out, line count kept. */
function proseOf(markdown) {
  let fenced = false;
  return markdown.split(/\r?\n/).map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return '';
    }
    return fenced ? '' : line.replace(/`[^`]*`/g, (code) => ' '.repeat(code.length));
  });
}

/** GitHub's ids for the headings of a Markdown text, duplicates numbered. */
export function headingIds(markdown) {
  const ids = new Set();
  const counts = new Map();
  for (const line of proseOf(markdown)) {
    const match = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const base = match[1]
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
      .replace(/\s/g, '-');
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    ids.add(seen === 0 ? base : `${base}-${seen}`);
  }
  return ids;
}

function brokenLinks(root, file, text, add) {
  proseOf(text).forEach((line, index) => {
    for (const [, target] of line.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // http:, mailto: and other schemes
      const [path, anchor] = target.split('#');
      const targetFile = path
        ? posix.normalize(posix.join(posix.dirname(file), decodeURI(path)))
        : file;
      const absolute = join(root, targetFile);
      if (!existsSync(absolute)) {
        add('broken-link', index + 1, `links to ${targetFile}, which does not exist`);
        continue;
      }
      if (
        anchor &&
        targetFile.endsWith('.md') &&
        !headingIds(readFileSync(absolute, 'utf8')).has(anchor)
      ) {
        add(
          'broken-link',
          index + 1,
          `links to #${anchor}, which is not a heading of ${targetFile}`,
        );
      }
    }
  });
}

/** Inline code outside fenced blocks, one entry per span, with its line. */
function inlineCode(markdown) {
  const spans = [];
  let fenced = false;
  markdown.split(/\r?\n/).forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    else if (!fenced) {
      for (const [, code] of line.matchAll(/`([^`]+)`/g)) spans.push({ code, line: index + 1 });
    }
  });
  return spans;
}

/** The pack folders under `root`, as `apps/<pack>`. */
function packDirs(root) {
  const apps = join(root, 'apps');
  if (!existsSync(apps)) return [];
  return readdirSync(apps, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `apps/${entry.name}`);
}

function brokenReferences(root, file, text, add) {
  const bases = ['', posix.dirname(file), ...packDirs(root)];
  for (const { code, line } of inlineCode(text)) {
    const path = code.replace(/:\d+$/, '').split('#')[0];
    if (!PATH_LIKE.test(path) || !/\.[a-z]+$/i.test(path)) continue;
    if (SKIPPED_DIRS.has(path.split('/')[0])) continue;
    if (bases.some((base) => existsSync(join(root, base, path)))) continue;
    add('broken-reference', line, `names ${path}, which does not exist`);
  }
}

/** The base URLs the example configuration names, without trailing slashes. */
function configuredHosts(root) {
  const file = join(root, 'qa-config.example.json');
  if (!existsSync(file)) return [];
  const environments = JSON.parse(readFileSync(file, 'utf8')).app?.environments ?? {};
  return Object.values(environments)
    .flatMap((environment) => Object.values(environment.packs ?? {}))
    .map((pack) => String(pack.base_url ?? '').replace(/\/+$/, ''))
    .filter(Boolean);
}

function hostsInNotes(text, hosts, add) {
  proseOf(text).forEach((line, index) => {
    const host = hosts.find((url) => line.includes(url));
    if (host) add('host-in-notes', index + 1, `writes ${host}; write <base_url> instead`);
    else if (/\blocalhost:\d+/.test(line))
      add('host-in-notes', index + 1, 'writes a localhost address; write <base_url> instead');
  });
}

/** Lines of `text` that present the framework as taken from elsewhere; quoted mentions pass. */
export function wordingFindings(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const unquoted = line.replace(/"[^"\n]*"|`[^`\n]*`|“[^”\n]*”/g, (quoted) =>
      ' '.repeat(quoted.length),
    );
    const match = DERIVATION.exec(unquoted);
    if (match) hits.push({ line: index + 1, phrase: match[0] });
  });
  return hits;
}

const CLOSED_BY = 'closed by';
const COMMIT_HASH = /^[0-9a-f]{7,40}$/i;

/** The cells of a Markdown table row, an escaped `\|` kept inside its cell. */
function tableCells(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
}

/**
 * The hashes the **Closed by** column of the backlog's **Done** table cites, with their lines.
 * Hashes anywhere else (the item text, the open tables, code blocks) are not read.
 * @returns {{ hash: string, line: number }[]}
 */
export function closingCommits(markdown) {
  const cited = [];
  let inDone = false;
  let fenced = false;
  let column = -1;
  markdown.split(/\r?\n/).forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) return;
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      if (heading[1].length <= 2) inDone = heading[2].trim().toLowerCase() === 'done';
      column = -1;
      return;
    }
    if (!line.trim().startsWith('|')) {
      column = -1; // a table ended; the next one starts with its own header
      return;
    }
    if (!inDone) return;
    const cells = tableCells(withoutHtmlComments(line));
    if (column === -1) {
      column = cells.findIndex((cell) => cell.toLowerCase() === CLOSED_BY);
      return;
    }
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) return; // the separator row
    for (const [, code] of (cells[column] ?? '').matchAll(/`([^`]+)`/g)) {
      if (COMMIT_HASH.test(code)) cited.push({ hash: code.toLowerCase(), line: index + 1 });
    }
  });
  return cited;
}

function git(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    env: gitEnv(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (spawnFailure(result) || result.status !== 0) {
    const detail = (result.stderr ?? '').trim() || describeExit(result);
    throw new Error(`git ${args.join(' ')} failed: ${detail}`);
  }
  return result.stdout.trim();
}

/** The full hashes of every commit in the history of `HEAD` of the repository at `root`. */
export function headHistory(root) {
  if (git(['rev-parse', '--is-shallow-repository'], root) === 'true') {
    throw new Error(
      'the clone is shallow, so the history of HEAD is incomplete; fetch the full history ' +
        '(git fetch --unshallow, or fetch-depth: 0 in CI) before checking the closing commits',
    );
  }
  return git(['rev-list', 'HEAD'], root).split('\n').filter(Boolean);
}

function closingCommitFindings(text, history, add) {
  const cited = closingCommits(text);
  if (cited.length === 0) return;
  const commits = history();
  for (const { hash, line } of cited) {
    if (commits.some((commit) => commit.startsWith(hash))) continue;
    add('closing-commit', line, `cites ${hash}, which is not a commit in the history of HEAD`);
  }
}

/** Findings for one file, by its path relative to `root`. */
export function lintFile(root, file, hosts = configuredHosts(root), history = () => []) {
  const text = readFileSync(join(root, file), 'utf8');
  const findings = [];
  const add = (rule, line, message) => findings.push(finding(rule, file, line, message));
  if (file.endsWith('.md')) brokenLinks(root, file, text, add);
  if (AGENT_FILE.test(file)) brokenReferences(root, file, text, add);
  if (NOTES_FILE.test(file)) hostsInNotes(text, hosts, add);
  if (file === BACKLOG) closingCommitFindings(text, history, add);
  if (!FIXED_TEXT.has(file)) {
    for (const { line, phrase } of wordingFindings(text)) {
      add(
        'public-wording',
        line,
        `"${phrase}" presents the framework as taken from another codebase`,
      );
    }
  }
  return findings;
}

/**
 * public-wording over the message of every commit in the history of `HEAD` of the repository at
 * `root`: a message is published with the history as much as a file is.
 * @returns {{ commit: string, line: number, phrase: string }[]}
 */
export function historyWordingFindings(root = REPO_ROOT) {
  headHistory(root); // stops on a shallow clone, whose history is incomplete
  const log = git(['log', '--format=%h%x00%B%x1e', 'HEAD'], root);
  return log
    .split('\x1e')
    .map((entry) => entry.replace(/^\n/, ''))
    .filter(Boolean)
    .flatMap((entry) => {
      const [commit, message = ''] = entry.split('\x00');
      return wordingFindings(message).map((hit) => ({ commit, ...hit }));
    });
}

/**
 * Every text file under `root`. `history` gives the full hashes of the history of `HEAD`; by default
 * it is read from the repository at `root`, once and only when the backlog cites a closing commit.
 */
export function lintDocs(root = REPO_ROOT, { history } = {}) {
  const hosts = configuredHosts(root);
  let commits = history;
  const lazyHistory = () => (commits ??= headHistory(root));
  return textFiles(root).flatMap((file) => lintFile(root, file, hosts, lazyHistory));
}

function main() {
  const { values } = parseArgs({
    options: {
      'self-test': { type: 'boolean', default: false },
      root: { type: 'string' },
      message: { type: 'string' },
      history: { type: 'boolean', default: false },
    },
  });
  if (values.history) {
    const hits = historyWordingFindings(resolve(values.root ?? REPO_ROOT));
    for (const { commit, line, phrase } of hits) {
      console.error(
        `commit ${commit}:${line}  public-wording  "${phrase}" presents the framework as taken from another codebase`,
      );
    }
    console.log(`${TOOL} history: ${hits.length === 0 ? 'clean' : `${hits.length} finding(s)`}.`);
    process.exitCode = hits.length > 0 ? 1 : 0;
    return;
  }
  if (values['self-test']) {
    process.exitCode = selfTest(TOOL, FIXTURES, lintDocs(FIXTURES, { history: SELF_TEST_HISTORY }));
    return;
  }
  if (values.message) {
    const hits = wordingFindings(readFileSync(values.message, 'utf8'));
    for (const { line, phrase } of hits) {
      console.error(
        `commit message:${line}  public-wording  "${phrase}" presents the framework as taken from another codebase`,
      );
    }
    process.exitCode = hits.length > 0 ? 1 : 0;
    return;
  }
  process.exitCode = report(TOOL, lintDocs(resolve(values.root ?? REPO_ROOT)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(`${TOOL}: ${error.message}`);
    process.exitCode = 2;
  }
}
