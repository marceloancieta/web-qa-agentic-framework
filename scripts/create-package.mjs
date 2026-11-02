#!/usr/bin/env node
/**
 * `npm run create:pack`: builds the `create-web-qa` package (packages/create-web-qa) with the
 * framework's product as its template, and packs it with `npm pack`. Nothing is published; that is
 * FUT-12, from a release tag.
 *
 *   node scripts/create-package.mjs [--out <dir>]      (default: reports/create-web-qa)
 *
 * The template is every tracked file that is product (scripts/lib/product.mjs): the framework's
 * development records stay out, and so does the package's own source. Markdown links into a
 * record become links to that file in the framework's repository at the release tag, so the
 * generated project's documents still lead to them. `.gitignore` travels as `gitignore`, since npm
 * leaves `.gitignore` out of a package, and the generator puts it back.
 *
 * Exit codes: 0 packed; 1 the build or `npm pack` failed.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './lib/cli.mjs';
import { gitEnv } from './lib/git.mjs';
import { DEVELOPMENT_RECORDS, FRAMEWORK_REPOSITORY, isUnder } from './lib/product.mjs';

export const PACKAGE_DIR = 'packages/create-web-qa';
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

/** Build the package folder under `out`: `{ dir, files }`. */
export function buildPackage(root = REPO_ROOT, out = join(root, 'reports', 'create-web-qa')) {
  const manifest = JSON.parse(readFileSync(join(root, PACKAGE_DIR, 'package.json'), 'utf8'));
  const tag = `v${manifest.version}`;
  const dir = join(out, 'package');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const name of ['package.json', 'index.mjs', 'README.md'])
    cpSync(join(root, PACKAGE_DIR, name), join(dir, name));
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
  const { values } = parseArgs({ options: { out: { type: 'string' } } });
  const out = resolve(values.out ?? join(REPO_ROOT, 'reports', 'create-web-qa'));
  const { dir, files } = buildPackage(REPO_ROOT, out);
  const pack = spawnSync('npm', ['pack', '--pack-destination', out], {
    cwd: dir,
    encoding: 'utf8',
  });
  if (pack.status !== 0) throw new Error(`npm pack failed: ${pack.stderr}`);
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
