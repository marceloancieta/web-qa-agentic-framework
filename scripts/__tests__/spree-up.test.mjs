// `npm run spree:up` (FUT-01): starts Spree only when it is not running, makes the admin of the
// configured variables, and loads the sample data once. Docker is replaced by a fake here; the
// script itself ran against the real containers when it was written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { REPO_ROOT } from '../lib/cli.mjs';
import { ACTOR, adminVariables, PACK, RUNNER, SERVICE, spreeUp } from '../spree-up.mjs';

const ENTRY = {
  actors: {
    admin: {
      account: 'existing',
      username_env: 'SHOP_ADMIN_USER',
      password_env: 'SHOP_ADMIN_PASS',
    },
  },
};
// Built at run time: the test data carries no credential-shaped literal.
const SECRET = ['not', 'a', 'real', 'one'].join('-');
const ENV = { SHOP_ADMIN_USER: 'admin@example.test', SHOP_ADMIN_PASS: SECRET };

/** A Docker that is running or not, and a runner that prints `summary`. */
function fakeDocker({
  healthy = false,
  up = 0,
  summary = { admin: 'created', sample_data: true, products: 38 },
} = {}) {
  const calls = [];
  return {
    calls,
    io: {
      healthy: () => healthy,
      up: (extra) => {
        calls.push(['up', extra]);
        return up;
      },
      prepare: (values) => {
        calls.push(['prepare', values]);
        return {
          code: 0,
          stdout: summary ? `noise\nspree-up ${JSON.stringify(summary)}\n` : 'noise\n',
        };
      },
      key: () => 'generated-key',
    },
  };
}

test('a stopped Spree is started with a new key; a running one keeps its data and its key', () => {
  const stopped = fakeDocker();
  const done = spreeUp({ env: ENV, entry: ENTRY, io: stopped.io });
  assert.equal(done.code, 0, done.lines.join('\n'));
  assert.deepEqual(stopped.calls[0], ['up', { SPREE_SECRET_KEY_BASE: 'generated-key' }]);
  assert.deepEqual(stopped.calls[1], [
    'prepare',
    { SPREE_UP_ADMIN_EMAIL: 'admin@example.test', SPREE_UP_ADMIN_PASSWORD: SECRET },
  ]);
  assert.deepEqual(done.lines, [
    'spree started and is healthy.',
    'admin of SHOP_ADMIN_USER: created.',
    'sample data loaded: 38 products.',
  ]);

  const running = fakeDocker({
    healthy: true,
    summary: { admin: 'kept', sample_data: false, products: 38 },
  });
  const again = spreeUp({ env: ENV, entry: ENTRY, io: running.io });
  assert.equal(again.code, 0);
  assert.deepEqual(
    running.calls.map(([step]) => step),
    ['prepare'],
    'a healthy Spree is not started again',
  );
  assert.match(again.lines[0], /already running and healthy; it keeps its data/);
  assert.equal(again.lines[2], 'sample data already there: 38 products.');

  // A key set in the environment is used as it is.
  const keyed = fakeDocker();
  spreeUp({ env: { ...ENV, SPREE_SECRET_KEY_BASE: 'mine' }, entry: ENTRY, io: keyed.io });
  assert.deepEqual(keyed.calls[0], ['up', { SPREE_SECRET_KEY_BASE: 'mine' }]);
});

test('a missing variable or actor stops before Docker, and no message carries a value', () => {
  for (const [env, name] of [
    [{ SHOP_ADMIN_PASS: SECRET }, 'SHOP_ADMIN_USER'],
    [{ SHOP_ADMIN_USER: 'admin@example.test', SHOP_ADMIN_PASS: '  ' }, 'SHOP_ADMIN_PASS'],
  ]) {
    const docker = fakeDocker();
    const result = spreeUp({ env, entry: ENTRY, io: docker.io });
    assert.equal(result.code, 2);
    assert.match(result.lines[0], new RegExp(`variable ${name}, which is not set`));
    assert.deepEqual(docker.calls, []);
  }
  for (const entry of [{}, { actors: { admin: { account: 'provisioned' } } }]) {
    const result = spreeUp({ env: ENV, entry, io: fakeDocker().io });
    assert.equal(result.code, 2);
    assert.match(result.lines[0], /needs an "admin" actor with "account": "existing"/);
  }
  const all = [];
  for (const failing of [{ up: 1 }, { summary: null }]) {
    const result = spreeUp({ env: ENV, entry: ENTRY, io: fakeDocker(failing).io });
    assert.equal(result.code, 1);
    all.push(...result.lines);
  }
  assert.ok(!all.join('\n').includes(SECRET));
});

test('the runner makes the admin, unlocks it, and loads the sample data only into an empty store', () => {
  assert.match(RUNNER, /ENV\.fetch\('SPREE_UP_ADMIN_EMAIL'\)/);
  assert.match(RUNNER, /ENV\.fetch\('SPREE_UP_ADMIN_PASSWORD'\)/);
  assert.match(RUNNER, /admin\.add_role\(role\.name, store\)/);
  assert.match(RUNNER, /update_columns\(failed_attempts: 0, locked_at: nil\)/);
  assert.match(RUNNER, /if Spree::Product\.count\.zero\?\n\s+Rails\.application\.load_tasks/);
  assert.match(RUNNER, /puts 'spree-up ' \+/);
});

test('the compose service, the qa-config actor and the scripts agree', () => {
  const compose = parse(readFileSync(join(REPO_ROOT, 'docker', 'compose.yml'), 'utf8'));
  const spree = compose.services[SERVICE];
  assert.match(spree.image, /^ghcr\.io\/spree\/spree:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/);
  assert.match(compose.services['spree-db'].image, /^postgres:[\w.-]+@sha256:[0-9a-f]{64}$/);
  // No key in the repository, and a compose command for another service never needs one.
  assert.equal(spree.environment.SECRET_KEY_BASE, '${SPREE_SECRET_KEY_BASE:-}');
  assert.equal(spree.ports[0].split(':')[0], '127.0.0.1');
  assert.equal(compose.services['spree-db'].ports, undefined, 'the database has no host port');
  assert.deepEqual(spree.depends_on, { 'spree-db': { condition: 'service_healthy' } });

  const example = JSON.parse(readFileSync(join(REPO_ROOT, 'qa-config.example.json'), 'utf8'));
  const entry = example.app.environments.local.packs[PACK];
  assert.equal(entry.base_url, `http://localhost:${spree.ports[0].split(':')[1]}`);
  assert.equal(entry.default_actor, ACTOR);
  assert.deepEqual(adminVariables(entry), {
    email: 'SPREE_ADMIN_EMAIL',
    password: 'SPREE_ADMIN_PASSWORD',
  });
  const envExample = readFileSync(join(REPO_ROOT, '.env.example'), 'utf8');
  for (const name of ['SPREE_ADMIN_EMAIL', 'SPREE_ADMIN_PASSWORD'])
    assert.match(envExample, new RegExp(`^${name}=$`, 'm'));

  const scripts = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).scripts;
  assert.equal(scripts['spree:up'], 'node scripts/spree-up.mjs');
  assert.equal(
    scripts['spree:down'],
    'docker compose -f docker/compose.yml rm --stop --force --volumes spree spree-db',
  );
});
