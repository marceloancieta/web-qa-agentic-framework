#!/usr/bin/env node
/**
 * Removes an app pack, the reverse of scaffold-app. A project that adopts the framework starts with
 * the example packs and removes the ones it does not test. Two steps, so nothing is removed before
 * someone has seen the plan:
 *
 *   node scripts/remove-app.mjs --name <pack>           prints what it would remove and change
 *   node scripts/remove-app.mjs --name <pack> --write   removes and changes it
 *
 * It removes apps/<pack>/ and the pack's skill .claude/skills/<pack>-ui/, takes the pack out of
 * every environment of qa-config.example.json (and of qa-config.json, when the machine has one),
 * and drops each Markdown table row that links into the removed folders. It changes nothing else:
 * the other files that still name the pack are listed for a person to edit, since a sentence about
 * a pack is not safe to rewrite by rule.
 *
 * A pack the core's own code or tests read (they name `apps/<pack>` or the pack as a quoted
 * string) is refused: removing it would break the gates. Juice Shop is such a pack, the worked
 * example the scaffold and the generation rules are checked against.
 *
 * Exit codes: 0 planned or removed; 1 refused (no such pack, or the core reads it); 2 usage error.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import * as prettier from 'prettier';
import { REPO_ROOT } from './lib/cli.mjs';
import { gitEnv } from './lib/git.mjs';
import { isUnder, packPaths } from './lib/product.mjs';

const NAME = /^[a-z][a-z0-9-]*$/;
/** The core: code and tests that must keep working without any particular pack. */
const CORE = ['scripts/', 'helpers/', 'fixtures/', '.claude/hooks/', 'playwright.config.ts'];
const CONFIG_FILES = ['qa-config.example.json', 'qa-config.json'];
const TEXT_FILE = /\.(?:md|ts|mts|mjs|js|json|ya?ml|txt)$|^\.env\.example$/;

function trackedFiles(root) {
  const run = spawnSync('git', ['ls-files', '-z'], { cwd: root, env: gitEnv(), encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`git ls-files failed: ${run.stderr}`);
  return run.stdout.split('\0').filter(Boolean);
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A line that is only a comment: an example in it is not code that reads the pack. */
const COMMENT_LINE = /^\s*(?:\/\/|\/?\*|#)/;

/** The core files whose code reads the pack: it names the pack's folder or quotes its name. */
export function coreReaders(root, pack, files = trackedFiles(root)) {
  const reads = new RegExp(`apps/${escape(pack)}/|['"\`]${escape(pack)}['"\`]`);
  return files.filter(
    (file) =>
      isUnder(file, CORE) &&
      !file.includes('__fixtures__/') &&
      TEXT_FILE.test(file) &&
      readFileSync(join(root, file), 'utf8')
        .split('\n')
        .some((line) => !COMMENT_LINE.test(line) && reads.test(line)),
  );
}

/**
 * qa-config without the pack in any environment, formatted as the repository formats JSON: the new
 * text, or null when it has no entry. An environment left with no pack is refused by the schema, so
 * it is named in `emptied` for a person to remove or fill.
 */
export async function configWithout(text, pack, file) {
  const config = JSON.parse(text);
  const emptied = [];
  let changed = false;
  for (const [name, environment] of Object.entries(config.app?.environments ?? {})) {
    if (environment.packs && Object.hasOwn(environment.packs, pack)) {
      delete environment.packs[pack];
      changed = true;
      if (Object.keys(environment.packs).length === 0) emptied.push(name);
    }
  }
  if (!changed) return null;
  const options = { ...(await prettier.resolveConfig(file)), filepath: file };
  return { text: await prettier.format(JSON.stringify(config), options), emptied };
}

/** A Markdown file without the table rows that link into `folders`, or null when it has none. */
export function markdownWithout(text, folders) {
  const lines = text.split('\n');
  const kept = lines.filter(
    (line) =>
      !(line.trimStart().startsWith('|') && folders.some((folder) => line.includes(folder))),
  );
  return kept.length === lines.length ? null : kept.join('\n');
}

/** What removing the pack does: `{ removed, edited: [{ file, text }], emptied, review }`. */
export async function removalPlan(root, pack) {
  const files = trackedFiles(root);
  const folders = packPaths(pack);
  const removed = folders.filter((folder) => existsSync(join(root, folder)));
  const remaining = files.filter((file) => !isUnder(file, folders));
  const edited = [];
  const emptied = [];
  for (const file of CONFIG_FILES.filter((name) => existsSync(join(root, name)))) {
    const path = join(root, file);
    const result = await configWithout(readFileSync(path, 'utf8'), pack, path);
    if (result === null) continue;
    edited.push({ file, text: result.text });
    emptied.push(...result.emptied.map((name) => `${file}: app.environments.${name}`));
  }
  for (const file of remaining.filter((name) => name.endsWith('.md'))) {
    const text = markdownWithout(readFileSync(join(root, file), 'utf8'), folders);
    if (text !== null) edited.push({ file, text });
  }
  const names = new RegExp(escape(pack).replace(/-/g, '[-_ ]?'), 'i');
  const review = remaining.filter((file) => {
    if (!TEXT_FILE.test(file)) return false;
    const text =
      edited.find((edit) => edit.file === file)?.text ?? readFileSync(join(root, file), 'utf8');
    return names.test(text);
  });
  return { removed, edited, emptied, review };
}

/** Run a removal: `{ code, lines }`, the exit code and what to print. */
export async function removeApp(root, { name, write = false }) {
  if (!NAME.test(name ?? ''))
    return { code: 2, lines: ['--name must be a pack name, such as saucedemo.'] };
  if (!existsSync(join(root, 'apps', name)))
    return { code: 1, lines: [`apps/${name}/ does not exist.`] };
  const readers = coreReaders(root, name);
  if (readers.length)
    return {
      code: 1,
      lines: [
        `${name} is read by the core, so removing it would break the gates:`,
        ...readers.map((file) => `  ${file}`),
      ],
    };
  const plan = await removalPlan(root, name);
  const lines = [
    ...plan.removed.map((folder) => `remove ${folder}`),
    ...plan.edited.map((edit) => `edit   ${edit.file}`),
  ];
  if (plan.emptied.length)
    lines.push(
      `Environments left with no pack, which config:check refuses; remove or fill them:`,
      ...plan.emptied.map((at) => `  ${at}`),
    );
  if (plan.review.length)
    lines.push(`Still naming ${name}, to edit by hand:`, ...plan.review.map((file) => `  ${file}`));
  if (!write)
    return { code: 0, lines: [...lines, 'Nothing changed; run again with --write to apply.'] };
  for (const folder of plan.removed) rmSync(join(root, folder), { recursive: true, force: true });
  for (const edit of plan.edited) writeFileSync(join(root, edit.file), edit.text);
  return { code: 0, lines: [...lines, `Removed ${name}. Then run npm run gates.`] };
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      options: { name: { type: 'string' }, write: { type: 'boolean', default: false } },
    }));
  } catch (error) {
    console.error(`remove-app: ${error.message}`);
    process.exit(2);
  }
  const { code, lines } = await removeApp(REPO_ROOT, values);
  for (const line of lines) (code === 0 ? console.log : console.error)(`remove-app: ${line}`);
  process.exitCode = code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`remove-app: ${error.message}`);
    process.exitCode = 1;
  });
}
