import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import { configErrors, filesToCheck } from '../config-check.mjs';
import { ENV_VAR_NAME } from '../lib/env-names.mjs';

const example = () => JSON.parse(readFileSync(join(REPO_ROOT, 'qa-config.example.json'), 'utf8'));

/** The example with one pack entry of the local environment replaced. */
function withPack(name, entry) {
  const config = example();
  config.app.environments.local.packs[name] = entry;
  return config;
}

test('the tracked example is valid', () => {
  assert.deepEqual(configErrors(example()), []);
});

test('the envVar pattern of the schema and the one messages use are the same', () => {
  const schema = JSON.parse(
    readFileSync(join(REPO_ROOT, 'schemas', 'qa-config.schema.json'), 'utf8'),
  );
  assert.equal(schema.$defs.envVar.pattern, ENV_VAR_NAME.source);
});

test('schema problems name the path and the unknown key', () => {
  const config = example();
  config.app.environments.local.projects = ['desktop-chrome'];
  config.app.environments.local.packs['juice-shop'].baseurl = 'http://x.test';
  const errors = configErrors(config).join('\n');
  assert.match(
    errors,
    /\/app\/environments\/local\/projects\/0 must be equal to one of the allowed values/,
  );
  assert.match(errors, /must NOT have additional properties: "baseurl"/);
});

test('an actor whose account is neither provisioned nor existing is refused', () => {
  const errors = configErrors(
    withPack('demo', { base_url: 'http://demo.test', actors: { a: { account: 'shared' } } }),
  );
  assert.ok(
    errors.some((error) => error.includes('/actors/a')),
    errors.join('\n'),
  );
});

test('an existing account names its variables, never values', () => {
  const entry = {
    base_url: 'http://demo.test',
    actors: { a: { account: 'existing', username_env: 'DEMO_USER', password_env: 'hunter2' } },
  };
  assert.ok(configErrors(withPack('demo', entry)).length > 0);
});

test('anonymous is built in and cannot be redefined', () => {
  const entry = { base_url: 'http://demo.test', actors: { anonymous: { account: 'provisioned' } } };
  assert.ok(configErrors(withPack('demo', entry)).length > 0);
});

test('cross-field rules: recovery and provisioned accounts need writes', () => {
  const entry = {
    base_url: 'http://demo.test',
    recovery: { command: 'docker compose restart demo' },
    actors: { buyer: { account: 'provisioned' } },
  };
  const errors = configErrors(withPack('demo', entry)).join('\n');
  assert.match(errors, /packs\.demo\.recovery is set but allow_writes is false/);
  assert.match(errors, /packs\.demo\.actors\.buyer creates its account, which needs allow_writes/);
});

test('cross-field rules: the default actor must be one of the actors', () => {
  const entry = {
    base_url: 'http://demo.test',
    default_actor: 'admin',
    actors: {
      buyer: { account: 'existing', username_env: 'DEMO_USER', password_env: 'DEMO_PASS' },
    },
  };
  assert.match(
    configErrors(withPack('demo', entry)).join('\n'),
    /default_actor "admin" is not one of its actors: buyer/,
  );
});

test('cross-field rules: the default environment, the key pattern and the gate bands', () => {
  const config = example();
  config.app.default_environment = 'staging';
  config.tracker.key_pattern = 'LOCAL-(';
  config.policies.commit.require_tracker_key = true;
  config.quality_gate.pass_rate = { fail_below_pct: 90, review_below_pct: 80 };
  config.quality_gate.accessibility = { fail_above: { serious: 0 }, review_above: { serious: 2 } };
  config.quality_gate.visual = { fail_above: 1, review_above: 3 };
  config.quality_gate.mutation = { fail_below_pct: 60, review_below_pct: 59.9 };
  const errors = configErrors(config).join('\n');
  assert.match(errors, /mutation\.review_below_pct \(59\.9\) is below fail_below_pct \(60\)/);
  assert.match(errors, /default_environment "staging" is not one of: local, ci/);
  assert.match(errors, /key_pattern is not a valid regex/);
  assert.match(errors, /pass_rate\.review_below_pct \(80\) is below fail_below_pct \(90\)/);
  assert.match(
    errors,
    /accessibility\.review_above\.serious \(2\) is above fail_above\.serious \(0\)/,
  );
  assert.match(errors, /visual\.review_above \(3\) is above fail_above \(1\)/);
});

test('a key rule without a key pattern is refused', () => {
  const config = example();
  config.tracker.key_pattern = null;
  config.policies.commit.require_tracker_key = true;
  assert.match(
    configErrors(config).join('\n'),
    /require_tracker_key is true but tracker\.key_pattern is not set/,
  );
});

test('the files checked: --all adds the local file only when it exists', () => {
  assert.deepEqual(filesToCheck(['--all'], join(REPO_ROOT, 'docs')), ['qa-config.example.json']);
  assert.deepEqual(filesToCheck(['a.json', 'b.json']), ['a.json', 'b.json']);
  assert.deepEqual(filesToCheck([], join(REPO_ROOT, 'docs')), ['qa-config.example.json']);
});
