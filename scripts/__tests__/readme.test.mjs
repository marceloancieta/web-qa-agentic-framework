// The README's badges state versions that live elsewhere; this keeps them equal to their owners, so a
// change of Node or Playwright cannot leave the front page behind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';

const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));

/** The message of the shields.io static badge with this label, decoded. */
function badge(label) {
  // The colour is a hex value or a named one (`blue`); `--` in the message is an escaped hyphen.
  const match = new RegExp(
    `img\\.shields\\.io/badge/${label}-(.+?)-(?:[0-9A-Fa-f]{6}|[a-z]+)\\.svg`,
  ).exec(readme);
  assert.ok(match, `the README has a ${label} badge`);
  return decodeURIComponent(match[1]).replace(/--/g, '-');
}

test('the Node badge states the engines range of package.json', () => {
  assert.equal(badge('node'), pkg.engines.node);
});

test('the Playwright badge states the major and minor version package.json depends on', () => {
  const [major, minor] = /(\d+)\.(\d+)/.exec(pkg.devDependencies['@playwright/test']).slice(1);
  assert.equal(badge('playwright'), `${major}.${minor}`);
});

test('the license badge states the license of package.json', () => {
  assert.equal(badge('license'), pkg.license);
});

test('the CI badge points at a workflow that exists', () => {
  const [, workflow] = /actions\/workflows\/([\w.-]+\.ya?ml)\/badge\.svg/.exec(readme) ?? [];
  assert.ok(workflow, 'the README has a CI badge');
  assert.ok(existsSync(join(REPO_ROOT, '.github', 'workflows', workflow)), workflow);
});
