import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { configErrors } from '../config-check.mjs';
import { REPO_ROOT } from '../lib/cli.mjs';
import { defaultProjects, deviceProjects } from '../lib/devices.mjs';
import { coverageGaps, pairwiseSet, product, requiredPairs } from '../lib/pairwise.mjs';
import { packRoles, parseRun, projectGaps, runGaps, runSet } from '../lib/run-matrix.mjs';
import { environmentRuns } from '../pairwise.mjs';

/** Every pair of two different factors that the rows hold, as text. */
function pairsOf(rows, names) {
  const pairs = new Set();
  for (const row of rows)
    for (let i = 0; i < names.length; i += 1)
      for (let j = i + 1; j < names.length; j += 1)
        pairs.add(`${names[i]}=${row[names[i]]} ${names[j]}=${row[names[j]]}`);
  return pairs;
}

test('without constraints the set holds every pair, in fewer rows than the product', () => {
  const factors = { a: ['1', '2', '3'], b: ['x', 'y', 'z'], c: ['p', 'q', 'r'], d: ['u', 'v'] };
  const set = pairwiseSet(factors);
  const names = Object.keys(factors);
  assert.equal(pairsOf(set, names).size, pairsOf(product(factors), names).size);
  assert.ok(set.length < product(factors).length / 2, `${set.length} rows`);
  assert.deepEqual(coverageGaps(set, factors).missing, []);
  // The same factors always give the same set.
  assert.deepEqual(pairwiseSet(factors), set);
});

test('a constraint removes the pairs no allowed row realizes, and the set uses allowed rows only', () => {
  const factors = { browser: ['chromium', 'firefox'], device: ['desktop', 'mobile'] };
  const allowed = (row) => !(row.browser === 'firefox' && row.device === 'mobile');
  assert.equal(requiredPairs(factors, allowed).size, 3);
  const set = pairwiseSet(factors, allowed);
  assert.ok(set.every(allowed));
  assert.equal(set.length, 3);
});

test('gaps name the missing pairs and the rows that cannot exist', () => {
  const factors = { browser: ['chromium', 'firefox'], device: ['desktop', 'mobile'] };
  const allowed = (row) => !(row.browser === 'firefox' && row.device === 'mobile');
  const { missing, notAllowed } = coverageGaps(
    [
      { browser: 'chromium', device: 'desktop' },
      { browser: 'firefox', device: 'mobile' },
    ],
    factors,
    allowed,
  );
  assert.deepEqual(notAllowed, [{ browser: 'firefox', device: 'mobile' }]);
  assert.deepEqual(missing, [
    [{ browser: 'chromium' }, { device: 'mobile' }],
    [{ browser: 'firefox' }, { device: 'desktop' }],
  ]);
});

test('the device catalog gives each project its engine and form factor', () => {
  const catalog = deviceProjects(REPO_ROOT);
  const byName = Object.fromEntries(catalog.map((p) => [p.name, p]));
  assert.deepEqual(byName['desktop-firefox'], {
    name: 'desktop-firefox',
    browser: 'firefox',
    formFactor: 'desktop',
  });
  assert.equal(byName.tablet.browser, 'webkit');
  assert.equal(byName['mobile-chrome'].browser, 'chromium');
  assert.ok(defaultProjects(REPO_ROOT).every((name) => name in byName));
});

test('a run is a project and a role; anything else is not a run', () => {
  assert.deepEqual(parseRun('desktop-firefox as customer'), {
    project: 'desktop-firefox',
    role: 'customer',
  });
  for (const text of ['desktop-firefox', 'desktop-firefox as', 'Desktop as customer', 'a as b c'])
    assert.equal(parseRun(text), null, text);
});

test('the run set covers browser, form factor and role over the catalog, with real projects', () => {
  const catalog = deviceProjects(REPO_ROOT);
  const roles = ['anonymous', 'customer'];
  const runs = runSet(catalog, roles);
  assert.deepEqual(runGaps(runs, catalog, roles), { unknown: [], missing: [] });
  assert.ok(runs.length < catalog.length * roles.length);
  assert.ok(runs.every((run) => catalog.some((p) => p.name === run.project)));
  const { missing } = runGaps(
    runs.filter((run) => run.project !== 'desktop-firefox'),
    catalog,
    roles,
  );
  assert.ok(missing.includes('browser firefox with form factor desktop'), missing.join('; '));
});

test('project gaps are the browser and form factor pairs a project list misses', () => {
  const catalog = deviceProjects(REPO_ROOT);
  assert.deepEqual(
    projectGaps(
      [
        'desktop-chromium',
        'desktop-firefox',
        'desktop-webkit',
        'tablet',
        'mobile-chrome',
        'mobile-safari',
      ],
      catalog,
    ),
    [],
  );
  assert.deepEqual(
    projectGaps(
      [
        'desktop-chromium',
        'desktop-firefox',
        'desktop-webkit',
        'tablet-landscape',
        'mobile-chrome',
        'mobile-safari',
      ],
      catalog,
    ),
    [],
  );
  assert.deepEqual(
    projectGaps(
      ['desktop-chromium', 'desktop-firefox', 'desktop-webkit', 'tablet', 'mobile-chrome'],
      catalog,
    ),
    ['browser webkit with form factor mobile'],
  );
});

const example = () => JSON.parse(readFileSync(join(REPO_ROOT, 'qa-config.example.json'), 'utf8'));

test('the ci environment is pairwise, and config:check refuses a pairwise one that misses a pair', () => {
  const config = example();
  assert.equal(config.app.environments.ci.pairwise, true);
  assert.deepEqual(configErrors(config), []);
  config.app.environments.ci.projects = ['desktop-chromium', 'mobile-chrome'];
  const errors = configErrors(config).join('\n');
  assert.match(
    errors,
    /app\.environments\.ci is pairwise, but no project covers browser firefox with form factor desktop/,
  );
  config.app.environments.ci.pairwise = false;
  assert.deepEqual(configErrors(config), []);
});

test('npm run pairwise gives each pack of the environment its runs: anonymous and its actors', () => {
  assert.deepEqual(packRoles({ actors: { customer: {}, admin: {} } }), [
    'anonymous',
    'customer',
    'admin',
  ]);
  assert.deepEqual(packRoles({}), ['anonymous']);
  const result = environmentRuns(example(), 'ci');
  assert.equal(result.pairwise, true);
  assert.deepEqual(result.gaps, []);
  const [shop] = result.packs;
  assert.equal(shop.pack, 'juice-shop');
  assert.equal(shop.full, 12);
  assert.ok(shop.runs.length < shop.full);
  assert.deepEqual(runGaps(shop.runs, deviceProjects(REPO_ROOT), shop.roles), {
    unknown: [],
    missing: [],
  });
  assert.throws(
    () => environmentRuns(example(), 'nowhere'),
    /environment "nowhere" is not defined/,
  );
});
