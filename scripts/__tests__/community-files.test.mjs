// The community files a public repository needs (DOC-04): they exist, the security policy sends
// reports to a private channel, and the code of conduct is the Contributor Covenant 2.1 with its
// contact filled in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';

const read = (name) => readFileSync(join(REPO_ROOT, name), 'utf8');

test('the security policy reports through GitHub private vulnerability reporting', () => {
  const policy = read('SECURITY.md');
  assert.match(policy, /private\s+vulnerability\s+reporting/i);
  assert.match(policy, /\/security\/advisories\/new\)/);
  assert.match(policy, /Never open a public issue/);
  assert.match(policy, /^## Supported versions$/m);
  assert.match(policy, /^## Scope$/m);
});

test('the code of conduct is the Contributor Covenant 2.1 with a contact', () => {
  const conduct = read('CODE_OF_CONDUCT.md');
  assert.match(conduct, /^# Contributor Covenant Code of Conduct$/m);
  assert.match(conduct, /version 2\.1/);
  assert.doesNotMatch(conduct, /\[INSERT CONTACT METHOD\]/, 'the placeholder is filled in');
  assert.match(conduct, /responsible for enforcement at \S+@\S+\./);
  assert.doesNotMatch(conduct, /^\+\+\+$/m, 'no site front matter');
});

test('the contributing guide points at the security policy and the code of conduct', () => {
  const guide = read('CONTRIBUTING.md');
  assert.match(guide, /\]\(SECURITY\.md\)/);
  assert.match(guide, /\]\(CODE_OF_CONDUCT\.md\)/);
});
