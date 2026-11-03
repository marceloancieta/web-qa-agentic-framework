#!/usr/bin/env node
/**
 * `npm run create:pack`: builds the `create-web-qa` package (packages/create-web-qa) with the
 * framework's product as its template, and packs it with `npm pack`. Nothing is published here:
 * `.github/workflows/publish.yml` publishes the folder this builds, from a release tag (FUT-12).
 *
 *   node scripts/create-package.mjs [--out <dir>] [--tag vX.Y.Z]   (default out: reports/create-web-qa)
 *
 * The template is every tracked file that is product (scripts/lib/product.mjs): the framework's
 * development records stay out, and so does the package's own source. Markdown links into a
 * record become links to that file in the framework's repository at the release tag, so the
 * generated project's documents still lead to them. `.gitignore` travels as `gitignore`, since npm
 * leaves `.gitignore` out of a package, and the generator puts it back.
 *
 * `--tag` builds a release: it refuses a checkout that is not that tag, clean and on `main`, with
 * the package at the tag's version, and records the tag in `release.json` beside the package. The
 * package's `prepublishOnly` (prepublish.mjs) refuses a folder built without it, since a published
 * version can never be replaced.
 *
 * Exit codes: 0 packed; 1 the release checks, the build or `npm pack` failed.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './lib/cli.mjs';
import { gitEnv } from './lib/git.mjs';
import { DEVELOPMENT_RECORDS, FRAMEWORK_REPOSITORY, isUnder } from './lib/product.mjs';
import { spawnFailure } from './lib/spawn.mjs';

export const PACKAGE_DIR = 'packages/create-web-qa';
/** The files of the package's source folder that the build copies; `files` decides what ships. */
const SOURCE_FILES = ['package.json', 'index.mjs', 'README.md', 'prepublish.mjs'];
const RELEASE_TAG = /^v\d+\.\d+\.\d+$/;
const MARKDOWN_LINK = /(\]\()([^)\s#]+)(#[^)\s]*)?(\))/g;
const INLINE_PATH = /`([\w./-]+\.md)`/g;

/** The tracked files the package ships as its template, in `git ls-files` order. */
export function shippedFiles(root = REPO_ROOT) {
  const run = spawnSync('git', ['ls-files', '-z'], { cwd: root, env: gitEnv(), encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`git ls-files failed: ${run.stderr}`);
  return run.stdout
    .split('\0')
    .filter(Boolean)
    .filter((file) => !isUnder(file, DEVELOPMENT_RECORDS) && !file.startsWith(`${PACKAGE_DIR}/`));
}

/**
 * A Markdown file of the template with each reference to a development record turned into a link
 * to that record in the framework's repository at `tag`: a relative link, and a path written as
 * inline code (from the repository root, as lint-docs reads it), which becomes a plain link.
 */
export function linkRecords(text, file, tag) {
  const url = (path) => `${FRAMEWORK_REPOSITORY}/blob/${tag}/${path}`;
  return text
    .replace(MARKDOWN_LINK, (whole, open, target, anchor = '', close) => {
      if (/^[a-z]+:/i.test(target)) return whole;
      const path = posix.normalize(posix.join(posix.dirname(file), target));
      return isUnder(path, DEVELOPMENT_RECORDS) ? `${open}${url(path)}${anchor}${close}` : whole;
    })
    .replace(INLINE_PATH, (whole, path) =>
      isUnder(path, DEVELOPMENT_RECORDS) && !path.endsWith('/') ? `[${path}](${url(path)})` : whole,
    );
}

/**
 * Why the checkout cannot be released as `tag`, empty when it can: the tag names the package's
 * version, and the checkout is that tag, clean, on `main`. `git` runs a git command (replaced in
 * the tests) and returns its `spawnSync` result.
 */
export function releaseProblems(tag, { version, git }) {
  if (!RELEASE_TAG.test(tag ?? '')) return [`"${tag ?? ''}" is not a release tag vX.Y.Z`];
  const problems = [];
  if (tag !== `v${version}`)
    problems.push(
      `the package is ${version}, not ${tag.slice(1)}; a release tags its release commit`,
    );
  const tagged = git(['rev-parse', '--verify', '--quiet', `${tag}^{commit}`]);
  if (tagged.status !== 0) return [...problems, `the tag ${tag} does not exist`];
  const commit = tagged.stdout.trim();
  if (git(['rev-parse', 'HEAD']).stdout.trim() !== commit)
    problems.push(`the checkout is not ${tag}; check the tag out`);
  if (git(['status', '--porcelain']).stdout.trim() !== '')
    problems.push('the working tree has changes, and the build reads it');
  if (git(['merge-base', '--is-ancestor', commit, 'origin/main']).status !== 0)
    problems.push(`${tag} is not on origin/main; a release is a tag on main`);
  return problems;
}

/**
 * Build the package folder under `out`: `{ dir, files }`. `tag` is the release it was built for,
 * recorded in `release.json` (not shipped) for the package's prepublish check; null outside one.
 */
export function buildPackage(
  root = REPO_ROOT,
  out = join(root, 'reports', 'create-web-qa'),
  { tag: release = null } = {},
) {
  const manifest = JSON.parse(readFileSync(join(root, PACKAGE_DIR, 'package.json'), 'utf8'));
  const tag = `v${manifest.version}`;
  const dir = join(out, 'package');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const name of SOURCE_FILES) cpSync(join(root, PACKAGE_DIR, name), join(dir, name));
  writeFileSync(join(dir, 'release.json'), `${JSON.stringify({ tag: release }, null, 2)}\n`);
  const files = shippedFiles(root);
  for (const file of files) {
    const target = join(dir, 'template', file === '.gitignore' ? 'gitignore' : file);
    mkdirSync(dirname(target), { recursive: true });
    if (file.endsWith('.md'))
      writeFileSync(target, linkRecords(readFileSync(join(root, file), 'utf8'), file, tag));
    else cpSync(join(root, file), target);
  }
  return { dir, files };
}

function main() {
  const { values } = parseArgs({ options: { out: { type: 'string' }, tag: { type: 'string' } } });
  const out = resolve(values.out ?? join(REPO_ROOT, 'reports', 'create-web-qa'));
  if (values.tag !== undefined) {
    const { version } = JSON.parse(
      readFileSync(join(REPO_ROOT, PACKAGE_DIR, 'package.json'), 'utf8'),
    );
    const git = (args) =>
      spawnSync('git', args, { cwd: REPO_ROOT, env: gitEnv(), encoding: 'utf8' });
    const problems = releaseProblems(values.tag, { version, git });
    if (problems.length > 0) throw new Error(`not a release: ${problems.join('; ')}`);
  }
  const { dir, files } = buildPackage(REPO_ROOT, out, { tag: values.tag ?? null });
  // A fixed command through the shell, as lanes.mjs does, so `npm` resolves to npm.cmd on Windows;
  // the destination is the folder above the package, so no path goes into the command.
  const pack = spawnSync('npm pack --pack-destination ..', {
    cwd: dir,
    encoding: 'utf8',
    shell: true,
  });
  if (pack.status !== 0)
    throw new Error(`npm pack failed: ${spawnFailure(pack) ?? pack.stderr.trim()}`);
  console.log(
    `create-package: ${files.length} template files; ${join(out, pack.stdout.trim().split('\n').at(-1))}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(`create-package: ${error.message}`);
    process.exitCode = 1;
  }
}
