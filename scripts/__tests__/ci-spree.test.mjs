// The Spree admin on a CI agent (FUT-01): `runEnv` of spree-up gives the admin's variables a
// placeholder address and a password generated for the run, and keeps the values the environment
// has; `npm run ci:spree` runs the pack's projects with them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { playwrightArgs, runPlan } from '../ci-spree.mjs';
import { PLACEHOLDER_ADMIN, runEnv, runPassword } from '../spree-up.mjs';

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
const GIVEN = ['kept', 'as', 'it', 'is'].join('-');
const MADE = ['made', 'for', 'the', 'run'].join('-');

test('an agent without the variables gets the placeholder address and a generated password', () => {
  const env = { PATH: '/bin' };
  const result = runEnv(env, ENTRY, () => MADE);
  assert.equal(result.env['SHOP_ADMIN_USER'], PLACEHOLDER_ADMIN);
  assert.equal(result.env['SHOP_ADMIN_PASS'], MADE);
  assert.deepEqual(result.filled, ['SHOP_ADMIN_USER', 'SHOP_ADMIN_PASS']);
  assert.equal(result.env['PATH'], '/bin');
  assert.deepEqual(env, { PATH: '/bin' }, 'the caller environment is left as it is');
});

test('values the environment has are kept, and blank ones are filled', () => {
  const result = runEnv(
    { SHOP_ADMIN_USER: 'someone@example.test', SHOP_ADMIN_PASS: GIVEN },
    ENTRY,
    () => MADE,
  );
  assert.equal(result.env['SHOP_ADMIN_USER'], 'someone@example.test');
  assert.equal(result.env['SHOP_ADMIN_PASS'], GIVEN);
  assert.deepEqual(result.filled, []);

  const blank = runEnv({ SHOP_ADMIN_USER: '  ', SHOP_ADMIN_PASS: '' }, ENTRY, () => MADE);
  assert.deepEqual(blank.filled, ['SHOP_ADMIN_USER', 'SHOP_ADMIN_PASS']);
});

test('a pack without an existing admin actor is refused', () => {
  assert.throws(() => runEnv({}, { actors: {} }), /needs an "admin" actor/);
});

test('each run gets its own long password with every character class', () => {
  const [first, second] = [runPassword(), runPassword()];
  assert.notEqual(first, second);
  assert.ok(first.length >= 24);
  for (const kind of [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/]) assert.match(first, kind);
});

test("the run selects the pack's projects and passes the caller's options on", () => {
  assert.deepEqual(playwrightArgs(['--workers=2']), ['test', '--project=spree-*', '--workers=2']);
  assert.deepEqual(runPlan(['--workers=2']), {
    lane: null,
    args: ['test', '--project=spree-*', '--workers=2'],
  });
  assert.deepEqual(runPlan([]), { lane: null, args: ['test', '--project=spree-*'] });
});

test("a leading --lane runs that lane over the pack's projects, with a report of its own", () => {
  const expected = {
    lane: 'a11y',
    args: ['a11y', '--project=spree-*', '--workers=2'],
    report: join('reports', 'lanes', 'a11y-spree.json'),
  };
  assert.deepEqual(runPlan(['--lane', 'a11y', '--workers=2']), expected);
  assert.deepEqual(runPlan(['--lane=a11y', '--workers=2']), expected);
});

test('a --lane that is not first, or names no lane, is refused', () => {
  assert.match(runPlan(['--workers=2', '--lane', 'a11y']).refusal, /must come first/);
  assert.match(runPlan(['--workers=2', '--lane=a11y']).refusal, /must come first/);
  assert.match(runPlan(['--lane']).refusal, /needs a lane name, got ""/);
  assert.match(runPlan(['--lane', '--workers=2']).refusal, /needs a lane name/);
  assert.match(runPlan(['--lane=']).refusal, /needs a lane name/);
});

test('an option that only starts like --lane is passed to Playwright', () => {
  assert.deepEqual(runPlan(['--lanes']).args, ['test', '--project=spree-*', '--lanes']);
});
