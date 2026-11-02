#!/usr/bin/env node
/**
 * `npm run framework:update -- --to v<x.y.z>`: takes a later release of the framework into a
 * project that adopted it, either a copy made with GitHub's "Use this template" or a project made
 * by `npm create web-qa`. Such a project shares no history with the framework, so the update is a
 * patch: the difference between the release the project holds and the one asked for, over the
 * product files only (scripts/lib/product.mjs), applied with a three-way merge so the project's own
 * changes stay. The framework's development records and the app packs are never touched.
 *
 *   node scripts/framework-update.mjs --to <tag> [--from <tag>] [--repository <url>] [--write]
 *
 * Without --write it fetches both releases and prints what would change. With --write it applies
 * the patch to the working tree and the index and records the new release in `.web-qa.json`;
 * conflicts are left with markers for a person to resolve. The release the project holds is read
 * from `.web-qa.json` (`release`, `repository`) unless --from or --repository say otherwise; the
 * repository defaults to the framework's (scripts/lib/product.mjs). The first update of a copy
 * names its release with --from, and the update records it.
 *
 * Exit codes: 0 planned, or applied cleanly; 1 refused (a tree with uncommitted changes, an unknown
 * release, a release that is not later) or applied with conflicts; 2 usage error.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './lib/cli.mjs';
import { gitEnv } from './lib/git.mjs';
import {
  DEVELOPMENT_RECORDS,
  FRAMEWORK_REPOSITORY,
  isAdopterOwned,
  isUnder,
} from './lib/product.mjs';

export const RECORD_FILE = '.web-qa.json';
const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const REF_PREFIX = 'refs/web-qa/';

/** `[major, minor, patch]` of a release tag, or null when it is not `v<x.y.z>`. */
export function releaseOf(tag) {
  const match = TAG.exec(String(tag ?? ''));
  return match ? match.slice(1).map(Number) : null;
}

/** True when release tag `a` comes after `b`. */
export function isLater(a, b) {
  const [x, y] = [releaseOf(a), releaseOf(b)];
  for (let index = 0; index < 3; index += 1) if (x[index] !== y[index]) return x[index] > y[index];
  return false;
}

/** True when a path changed between releases belongs to the update. */
export const isUpdated = (path) => !isUnder(path, DEVELOPMENT_RECORDS) && !isAdopterOwned(path);

/** The record of the release a project holds, or `{}` when it has none. */
export function readRecord(root) {
  const file = join(root, RECORD_FILE);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

function git(root, args, input) {
  const run = spawnSync('git', args, { cwd: root, env: gitEnv(), encoding: 'utf8', input });
  return { ok: run.status === 0, stdout: run.stdout ?? '', stderr: (run.stderr ?? '').trim() };
}

/**
 * The changes between two fetched releases that the update takes: `[{ status, path }]`, with
 * status A (added), M (modified) or D (deleted); a rename is a deletion and an addition.
 */
export function plannedChanges(root, from, to) {
  const diff = git(root, [
    'diff',
    '--no-renames',
    '--name-status',
    `${REF_PREFIX}${from}`,
    `${REF_PREFIX}${to}`,
  ]);
  if (!diff.ok) throw new Error(`git diff failed: ${diff.stderr}`);
  return diff.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, path] = line.split('\t');
      return { status: status.charAt(0), path };
    })
    .filter((change) => isUpdated(change.path));
}

/** Fetch both release tags into refs of their own, so they never mix with the project's tags. */
function fetchReleases(root, repository, tags) {
  const refspecs = tags.map((tag) => `+refs/tags/${tag}:${REF_PREFIX}${tag}`);
  const fetched = git(root, ['fetch', '--no-tags', '--quiet', repository, ...refspecs]);
  if (!fetched.ok)
    throw new Error(`cannot fetch ${tags.join(' and ')} from ${repository}: ${fetched.stderr}`);
}

/** Apply the planned changes with a three-way merge; the paths left with conflicts. */
function applyChanges(root, from, to, paths) {
  const patch = git(root, [
    'diff',
    '--no-renames',
    '--binary',
    `${REF_PREFIX}${from}`,
    `${REF_PREFIX}${to}`,
    '--',
    ...paths,
  ]);
  if (!patch.ok) throw new Error(`git diff failed: ${patch.stderr}`);
  const applied = git(root, ['apply', '--3way', '--index', '--whitespace=nowarn'], patch.stdout);
  if (applied.ok) return [];
  const unmerged = git(root, ['diff', '--name-only', '--diff-filter=U']);
  const conflicts = unmerged.stdout.split('\n').filter(Boolean);
  if (conflicts.length === 0) throw new Error(`git apply failed: ${applied.stderr}`);
  return conflicts;
}

/** Run an update: `{ code, lines }`, the exit code and what to print. */
export function frameworkUpdate(root, { to, from, repository, write = false }) {
  const record = readRecord(root);
  const source = {
    from: from ?? record.release,
    repository: repository ?? record.repository ?? FRAMEWORK_REPOSITORY,
  };
  if (!releaseOf(to))
    return { code: 2, lines: [`--to must be a release tag such as v0.2.0, got "${to ?? ''}".`] };
  if (!releaseOf(source.from))
    return {
      code: 2,
      lines: [
        `no release to update from: pass --from v<x.y.z>, or record it in ${RECORD_FILE} (release).`,
      ],
    };
  if (!isLater(to, source.from))
    return {
      code: 1,
      lines: [`${to} is not later than ${source.from}, the release this project holds.`],
    };
  const status = git(root, ['status', '--porcelain']);
  if (!status.ok) return { code: 1, lines: [`not a git repository: ${status.stderr}`] };
  if (status.stdout.trim())
    return {
      code: 1,
      lines: ['the working tree has uncommitted changes; commit or stash them first.'],
    };

  fetchReleases(root, source.repository, [source.from, to]);
  const changes = plannedChanges(root, source.from, to);
  const lines = [
    `${source.from} -> ${to}: ${changes.length} product file(s) change`,
    ...changes.map((change) => `  ${change.status} ${change.path}`),
  ];
  if (!write)
    return { code: 0, lines: [...lines, 'Nothing written; run again with --write to apply.'] };
  if (changes.length === 0) return { code: 0, lines };

  const conflicts = applyChanges(
    root,
    source.from,
    to,
    changes.map((change) => change.path),
  );
  writeFileSync(
    join(root, RECORD_FILE),
    `${JSON.stringify({ ...record, repository: source.repository, release: to }, null, 2)}\n`,
  );
  const next = changes.some((change) => change.path === 'package-lock.json')
    ? 'Then run npm ci, and npm run gates.'
    : 'Then run npm run gates.';
  if (conflicts.length)
    return {
      code: 1,
      lines: [
        ...lines,
        `Applied with ${conflicts.length} conflict(s); resolve the markers and git add each file:`,
        ...conflicts.map((path) => `  ${path}`),
        next,
      ],
    };
  return { code: 0, lines: [...lines, `Applied; the changes are staged. ${next}`] };
}

function main() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        to: { type: 'string' },
        from: { type: 'string' },
        repository: { type: 'string' },
        write: { type: 'boolean', default: false },
      },
    }));
  } catch (error) {
    console.error(`framework-update: ${error.message}`);
    process.exit(2);
  }
  const { code, lines } = frameworkUpdate(REPO_ROOT, values);
  for (const line of lines) (code === 0 ? console.log : console.error)(`framework-update: ${line}`);
  process.exitCode = code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(`framework-update: ${error.message}`);
    process.exitCode = 1;
  }
}
