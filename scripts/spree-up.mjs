#!/usr/bin/env node
/**
 * `npm run spree:up`: starts the Spree pack's application (FUT-01) and makes it ready to test.
 *
 * 1. Starts the `spree` and `spree-db` services of docker/compose.yml and waits until both are
 *    healthy, unless `spree` already is: a running Spree keeps its data and its sessions. A start
 *    gives SPREE_SECRET_KEY_BASE a new random value, so no key is kept in the repository.
 * 2. Signs the admin actor in Spree's terms: the admin user of the configured variables exists, has
 *    the admin role of the default store, has the password of its variable and is not locked out.
 *    The variable names come from the `admin` actor of the pack in qa-config.
 * 3. Loads Spree's sample data (products, orders, configuration) when the store has no product,
 *    which is the case only after a start from an empty database.
 *
 * The values reach the container as environment variables of `docker compose exec`, never as
 * arguments, which process lists and logs keep.
 *
 * Exit codes: 0 ready; 1 a step failed; 2 a variable or the configuration is missing.
 */

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/cli.mjs';
import { credential, loadLocalEnv } from './lib/env.mjs';
import { packEntry } from './lib/qa-config.mjs';
import { exitCodeOf, spawnFailure } from './lib/spawn.mjs';

export const PACK = 'spree';
export const ACTOR = 'admin';
export const SERVICE = 'spree';
const COMPOSE = ['compose', '-f', join('docker', 'compose.yml')];

/** The names of the variables that hold the admin's email and password, from the pack's actor. */
export function adminVariables(entry) {
  const actor = entry?.actors?.[ACTOR];
  if (actor?.account !== 'existing' || !actor.username_env || !actor.password_env) {
    throw new Error(
      `the ${PACK} pack needs an "${ACTOR}" actor with "account": "existing", "username_env" and "password_env" in qa-config.`,
    );
  }
  return { email: actor.username_env, password: actor.password_env };
}

// Runs in the container with `bin/rails runner`. It reads the admin from SPREE_UP_ADMIN_EMAIL and
// SPREE_UP_ADMIN_PASSWORD and prints one line: `spree-up {"admin":"...","sample_data":...}`.
export const RUNNER = `
email = ENV.fetch('SPREE_UP_ADMIN_EMAIL')
password = ENV.fetch('SPREE_UP_ADMIN_PASSWORD')
store = Spree::Store.default
admin = Spree.admin_user_class.find_or_initialize_by(email: email)
state = admin.new_record? ? 'created' : 'kept'
unless admin.persisted? && admin.valid_password?(password)
  state = 'password set' if state == 'kept'
  admin.password = password
  admin.password_confirmation = password
  admin.save!
end
if admin.respond_to?(:failed_attempts) && (admin.failed_attempts.to_i > 0 || admin.locked_at)
  admin.update_columns(failed_attempts: 0, locked_at: nil)
  state += ', unlocked'
end
role = Spree::Role.default_admin_role(store)
admin.add_role(role.name, store)
loaded = false
if Spree::Product.count.zero?
  Rails.application.load_tasks
  Rake::Task['spree:load_sample_data'].invoke
  loaded = true
end
puts 'spree-up ' + { admin: state, sample_data: loaded, products: Spree::Product.count }.to_json
`;

/**
 * Make Spree ready: `{ code, lines }`. `io` holds what touches Docker, replaced in the tests:
 * `healthy()` whether the service runs and is healthy, `up(env)` starts it and waits (exit code),
 * `prepare(env)` runs RUNNER (`{ code, stdout }`), `key()` a new secret key base.
 */
export function spreeUp({ env, entry, io }) {
  let names;
  let values;
  try {
    names = adminVariables(entry);
    values = {
      SPREE_UP_ADMIN_EMAIL: credential(env, names.email, `The ${PACK} pack's ${ACTOR} actor`),
      SPREE_UP_ADMIN_PASSWORD: credential(env, names.password, `The ${PACK} pack's ${ACTOR} actor`),
    };
  } catch (error) {
    return { code: 2, lines: [error.message] };
  }
  const lines = [];
  if (io.healthy()) {
    lines.push(`${SERVICE} is already running and healthy; it keeps its data.`);
  } else {
    const code = io.up({ SPREE_SECRET_KEY_BASE: env.SPREE_SECRET_KEY_BASE || io.key() });
    if (code !== 0)
      return { code: 1, lines: [...lines, `${SERVICE} did not start or become healthy.`] };
    lines.push(`${SERVICE} started and is healthy.`);
  }
  const prepared = io.prepare(values);
  const summary = /^spree-up (\{.*\})$/m.exec(prepared.stdout ?? '')?.[1];
  if (prepared.code !== 0 || !summary) {
    return {
      code: 1,
      lines: [...lines, `preparing ${SERVICE} failed (the admin or the sample data).`],
    };
  }
  const { admin, sample_data: loaded, products } = JSON.parse(summary);
  lines.push(
    `admin of ${names.email}: ${admin}.`,
    loaded
      ? `sample data loaded: ${products} products.`
      : `sample data already there: ${products} products.`,
  );
  return { code: 0, lines };
}

/** The Docker side, through the compose file of the repository. */
export function dockerIo() {
  const docker = (args, options = {}) =>
    spawnSync('docker', [...COMPOSE, ...args], { cwd: REPO_ROOT, encoding: 'utf8', ...options });
  return {
    healthy: () => {
      const run = docker(['ps', '--format', '{{.Health}}', SERVICE]);
      return run.status === 0 && run.stdout.trim() === 'healthy';
    },
    up: (extra) => {
      const run = docker(['up', '-d', '--wait', SERVICE], {
        stdio: 'inherit',
        env: { ...process.env, ...extra },
      });
      const failure = spawnFailure(run);
      if (failure) console.error(`spree-up: docker compose up ${failure}`);
      return exitCodeOf(run);
    },
    prepare: (values) => {
      const names = Object.keys(values).flatMap((name) => ['-e', name]);
      const run = docker(['exec', '-T', ...names, SERVICE, 'bin/rails', 'runner', RUNNER], {
        env: { ...process.env, ...values },
        maxBuffer: 16 * 1024 * 1024,
      });
      if (run.status !== 0) console.error(run.stderr?.split('\n').slice(-15).join('\n'));
      return { code: exitCodeOf(run), stdout: run.stdout ?? '' };
    },
    key: () => randomBytes(64).toString('hex'),
  };
}

function main() {
  loadLocalEnv();
  let entry;
  try {
    ({ entry } = packEntry(PACK, REPO_ROOT));
  } catch (error) {
    console.error(`spree-up: ${error.message}`);
    return 2;
  }
  const { code, lines } = spreeUp({ env: process.env, entry, io: dockerIo() });
  for (const line of lines) (code === 0 ? console.log : console.error)(`spree-up: ${line}`);
  return code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main();
