import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import { parseRegistry } from '../lib/registry.mjs';
import { DIMENSIONS } from '../lib/tags.mjs';

const template = (name) => readFileSync(join(REPO_ROOT, 'docs', 'templates', name), 'utf8');

test('the registry template example is a valid registry', () => {
  const example = /```markdown\n([\s\S]*?)\n```/.exec(template('registry.md'))?.[1];
  assert.ok(example, 'docs/templates/registry.md has a markdown example');
  const cited = [...example.matchAll(/\| (REQ-LOGIN-\d{2}) \|/g)].map(([, id]) => ({ id }));
  const registry = parseRegistry(example, 'docs/templates/registry.md', cited);
  assert.deepEqual(registry.problems, []);
  assert.equal(registry.cases.length, cited.length);
  assert.deepEqual(Object.keys(registry.meta.dimensions), Object.keys(DIMENSIONS));
});

test('the feature contract template lists every quality dimension, in the taxonomy order', () => {
  const text = template('feature-contract.md');
  const section = text.slice(
    text.indexOf('## Quality dimensions'),
    text.indexOf('## Measurements'),
  );
  const rows = [...section.matchAll(/^\| ([a-z0-9]+) \|/gm)].map(([, name]) => name);
  assert.deepEqual(rows, Object.keys(DIMENSIONS));
});

test('the feature contract template keeps the business rules columns the tools read', () => {
  assert.match(template('feature-contract.md'), /## Business rules\n\n\| ID \| Rule \| Source \|/);
});
