// Run by `npm publish` (prepublishOnly). A published version can never be replaced, so only a folder
// that `npm run create:pack -- --tag v<version>` built from the release tag is published: one that
// carries its template, at the package's version, and records that tag in `release.json`. The
// source folder packages/create-web-qa has neither, so publishing it is refused too.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const readJson = (dir, file) =>
  existsSync(join(dir, file)) ? JSON.parse(readFileSync(join(dir, file), 'utf8')) : null;

/** What keeps the package folder `dir` from being published; empty when it is ready. */
export function publishProblems(dir) {
  const { version } = readJson(dir, 'package.json');
  const fix = `run npm run create:pack -- --tag v${version} on a checkout of that tag`;
  const release = readJson(dir, 'release.json');
  const template = readJson(dir, 'template/package.json');
  if (!release || !template) return [`it has no release.json or no template: ${fix}`];
  const problems = [];
  if (release.tag !== `v${version}`)
    problems.push(`it was built ${release.tag ? `for ${release.tag}` : 'without --tag'}: ${fix}`);
  if (template.version !== version)
    problems.push(`its template is ${template.version}, the package is ${version}`);
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const problems = publishProblems(process.cwd());
  if (problems.length > 0) {
    console.error(`create-web-qa is not ready to publish: ${problems.join('; ')}.`);
    process.exit(1);
  }
}
