import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { credential, loadLocalEnv } from '../lib/env.mjs';
import { NOT_A_NAME, missingVariableMessage, redactUnlessVariableName } from '../lib/env-names.mjs';

// A password-like value, standing for a secret pasted into a `*_env` field by mistake.
const PASTED = 'open-Sesame#42';

test('a variable name is printed, anything else is redacted', () => {
  for (const name of ['X', 'SAUCEDEMO_PASSWORD', 'JUICE_SHOP_ADMIN_2']) {
    assert.equal(redactUnlessVariableName(name), name);
  }
  for (const value of [
    PASTED,
    'lower_case',
    '9LIVES',
    '_LEADING',
    'TWO WORDS',
    '',
    null,
    undefined,
    7,
  ]) {
    assert.equal(redactUnlessVariableName(value), NOT_A_NAME);
  }
});

test('the missing-variable message names the variable, or redacts what is not one', () => {
  assert.equal(
    missingVariableMessage('The jira tracker', 'JIRA_TOKEN'),
    'The jira tracker needs the environment variable JIRA_TOKEN, which is not set.',
  );
  const message = missingVariableMessage('Actor "standard"', PASTED);
  assert.ok(message.includes(NOT_A_NAME));
  assert.ok(!message.includes(PASTED));
});

test('credential returns a trimmed value and refuses a blank or missing one by name', () => {
  assert.equal(credential({ TOKEN_A: '  abc ' }, 'TOKEN_A', 'A tool'), 'abc');
  assert.throws(
    () => credential({ TOKEN_A: '   ' }, 'TOKEN_A', 'A tool'),
    /needs the environment variable TOKEN_A/,
  );
  assert.throws(
    () => credential({}, PASTED, 'A tool'),
    (error) => !error.message.includes(PASTED),
  );
});

test('the local env file fills in only what the environment does not set', () => {
  const root = mkdtempSync(join(tmpdir(), 'env-file-'));
  writeFileSync(
    join(root, '.env'),
    'QA_ENV_TEST_FILE_ONLY=from-file\nQA_ENV_TEST_BOTH=from-file\n',
  );
  process.env.QA_ENV_TEST_BOTH = 'from-shell';
  try {
    loadLocalEnv(root);
    assert.equal(process.env.QA_ENV_TEST_FILE_ONLY, 'from-file');
    assert.equal(process.env.QA_ENV_TEST_BOTH, 'from-shell');
    loadLocalEnv(join(root, 'missing'));
  } finally {
    delete process.env.QA_ENV_TEST_FILE_ONLY;
    delete process.env.QA_ENV_TEST_BOTH;
  }
});
