#!/usr/bin/env node
/**
 * Prints the CHANGELOG.md section of a release, without its heading, or creates the GitHub release
 * with that text, which is what `.github/workflows/publish.yml` does from a tag. A tag whose version
 * has no section is refused, since a release without notes says nothing about what it holds.
 *
 * Imports only Node and scripts/lib, so the release job needs no install.
 *
 *   npm run release:notes -- --tag vX.Y.Z     print the notes
 *   npm run release:create -- --tag vX.Y.Z    create the release (gh, with GH_TOKEN or its login)
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/cli.mjs';

const TAG = /^v(\d+\.\d+\.\d+)$/;

/** The body of the section of `version` in a changelog, trimmed; null when it has none. */
export function releaseSection(text, version) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
}

/** The version of a release tag, or null when `tag` is not `vX.Y.Z`. */
export function tagVersion(tag) {
  return TAG.exec(tag ?? '')?.[1] ?? null;
}

/** Creates the release of an existing tag through `gh`, which reads the notes from its stdin. */
export function createRelease(tag, notes, run = spawnSync) {
  const args = ['release', 'create', tag, '--verify-tag', '--title', tag, '--notes-file', '-'];
  const result = run('gh', args, { input: notes, stdio: ['pipe', 'inherit', 'inherit'] });
  if (result.error) throw new Error(`gh could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`gh release create failed (exit ${result.status}).`);
}

function main() {
  const at = process.argv.indexOf('--tag');
  const tag = at < 0 ? undefined : process.argv[at + 1];
  const version = tagVersion(tag);
  if (!version) throw new Error('Usage: node scripts/release-notes.mjs --tag vX.Y.Z');
  const section = releaseSection(readFileSync(join(REPO_ROOT, 'CHANGELOG.md'), 'utf8'), version);
  if (!section) throw new Error(`CHANGELOG.md has no section for ${version}.`);
  if (process.argv.includes('--create')) createRelease(tag, `${section}\n`);
  else process.stdout.write(`${section}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
