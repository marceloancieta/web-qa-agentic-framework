#!/usr/bin/env node
/**
 * `npm create web-qa@<version> <dir>`: a new test project from a release of the web-qa agentic
 * framework. It copies the release's product (template/, built by `npm run create:pack` in the
 * framework) into <dir>, names the project after the folder, and records the release in
 * .web-qa.json so `npm run framework:update` can take a later one. The framework's own development
 * records (backlog, changelog, decisions) are not in the package.
 *
 * Exit codes: 0 created; 1 refused (the folder exists and is not empty); 2 usage error.
 */

import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PACKAGE = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const TEMPLATE = new URL('./template/', import.meta.url);
/** npm leaves `.gitignore` out of a package, so the template carries it under this name. */
export const GITIGNORE = 'gitignore';

/** A package name from a folder name: lower case, with anything else turned into hyphens. */
export function projectName(dir) {
  const name = basename(resolve(dir))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-._]+|-+$/g, '');
  return name || 'web-qa-project';
}

/**
 * Create the project in `target` from the template folder `template`: `{ code, lines }`, the exit
 * code and what to print.
 */
export function create(template, target, { version, repository }) {
  if (!target) return { code: 2, lines: ['usage: npm create web-qa@<version> <dir>'] };
  if (existsSync(target) && readdirSync(target).length > 0)
    return { code: 1, lines: [`${target} exists and is not empty; choose a new folder.`] };
  cpSync(template, target, { recursive: true });
  if (existsSync(join(target, GITIGNORE)))
    renameSync(join(target, GITIGNORE), join(target, '.gitignore'));
  const manifestFile = join(target, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  writeFileSync(
    manifestFile,
    `${JSON.stringify({ ...manifest, name: projectName(target), version: '0.0.0', private: true }, null, 2)}\n`,
  );
  writeFileSync(
    join(target, '.web-qa.json'),
    `${JSON.stringify({ repository, release: `v${version}` }, null, 2)}\n`,
  );
  return {
    code: 0,
    lines: [
      `Created ${target} from web-qa v${version}. Next:`,
      `  cd ${target}`,
      '  git init && git add -A && git commit -m "chore: start from web-qa"',
      '  npm install && npm run hooks:install',
      '  npm run gates',
      'Then docs/guides/adopting.md: choose the packs and get the CI green.',
    ],
  };
}

function main() {
  const [target] = process.argv.slice(2);
  const { code, lines } = create(TEMPLATE, target, {
    version: PACKAGE.version,
    repository: PACKAGE.repository.url,
  });
  for (const line of lines) (code === 0 ? console.log : console.error)(line);
  process.exitCode = code;
}

// npm runs the bin through a link in node_modules/.bin, so compare the real path.
const entry = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : '';
if (import.meta.url === entry) main();
