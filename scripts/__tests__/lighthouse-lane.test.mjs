// The Lighthouse lane's plan and verdict: which audits it runs, where it refuses to go, and how the
// median scores of an audit's runs are judged. Lighthouse itself is not started here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditLine, judge, median, planAudits, routeSlug } from '../lighthouse-lane.mjs';

const lighthouse = {
  routes: ['/#/search', '/#/login'],
  runs: 3,
  min_scores: {
    desktop: { performance: 80, accessibility: 85 },
    mobile: { performance: 30 },
  },
};

const environment = (packs, name = 'local') => ({ source: 'qa-config.example.json', name, packs });
const shop = { base_url: 'http://localhost:3000', performance: { lighthouse } };
const demo = { base_url: 'https://demo.example' };

test('every route of a configured pack is audited per form factor; a pack without the lane is left out', () => {
  const plan = planAudits(environment({ shop, demo }), {}, {});
  assert.deepEqual(plan.leftOut, [
    'demo: no app.environments.local.packs.demo.performance.lighthouse',
  ]);
  assert.deepEqual(
    plan.audits.map((a) => `${a.formFactor} ${a.url} x${a.runs}`),
    [
      'desktop http://localhost:3000/#/search x3',
      'desktop http://localhost:3000/#/login x3',
      'mobile http://localhost:3000/#/search x3',
      'mobile http://localhost:3000/#/login x3',
    ],
  );
  assert.deepEqual(plan.audits[2].minScores, { performance: 30 });
  const mobile = planAudits(environment({ shop }), { formFactor: 'mobile' }, {});
  assert.deepEqual([...new Set(mobile.audits.map((a) => a.formFactor))], ['mobile']);
  const once = { ...shop, performance: { lighthouse: { ...lighthouse, runs: undefined } } };
  assert.equal(planAudits(environment({ once }), {}, {}).audits[0].runs, 3);
});

test('the lane goes only where qa-config points, and never to production', () => {
  assert.match(
    planAudits(environment({ shop }, 'production'), {}, {}).refusal,
    /looks like production/,
  );
  assert.match(planAudits(environment({ shop }), { packs: ['other'] }, {}).refusal, /no app\./);
  const elsewhere = { QA_SHOP_BASE_URL: 'https://shop.example.com' };
  assert.match(
    planAudits(environment({ shop }), {}, elsewhere).refusal,
    /QA_SHOP_BASE_URL points at https:\/\/shop\.example\.com, not http:\/\/localhost:3000/,
  );
  // The same origin under another path is the host qa-config names.
  const samePlace = { QA_SHOP_BASE_URL: 'http://localhost:3000/' };
  assert.equal(planAudits(environment({ shop }), {}, samePlace).audits.length, 4);
  assert.match(planAudits(environment({ shop }), { formFactor: 'tablet' }, {}).refusal, /desktop/);
});

const audit = {
  pack: 'shop',
  formFactor: 'mobile',
  route: '/#/search',
  url: 'http://localhost:3000/#/search',
  origin: 'http://localhost:3000',
  runs: 3,
  minScores: { performance: 30, accessibility: 85 },
};
const run = (performance, accessibility = 94, finalUrl = audit.url, error = null) => ({
  scores: { performance, accessibility },
  finalUrl,
  error,
});

test('the median of the runs is judged: one slow run passes, a slower page fails', () => {
  const healthy = judge(audit, [run(54), run(12), run(49)]);
  assert.deepEqual(healthy, { scores: { performance: 49, accessibility: 94 }, findings: [] });
  assert.match(auditLine(audit, healthy), /performance 49 \(min 30\), accessibility 94.*: ok$/);
  const slow = judge(audit, [run(24), run(28), run(41)]);
  assert.deepEqual(slow.findings, ['performance: median 28 below its minimum 30']);
  assert.match(auditLine(audit, slow), /FAILED: performance: median 28/);
});

test('a run that failed, left the host or gave no score is a finding, never a pass', () => {
  const broken = judge(audit, [
    run(60),
    run(null, null, audit.url, 'NO_FCP: The page did not paint any content.'),
    run(70, 94, 'https://elsewhere.example/'),
  ]);
  assert.deepEqual(broken.findings, [
    'run 2 failed: NO_FCP: The page did not paint any content.',
    'run 3 ended on https://elsewhere.example, not http://localhost:3000',
    'performance: no score from 1 run(s)',
    'accessibility: no score from 1 run(s)',
  ]);
  const nothing = judge(audit, [{ scores: {}, finalUrl: audit.url, error: 'timeout' }]);
  assert.deepEqual(nothing.scores, {});
  assert.equal(nothing.findings.length, 3);
});

test('medians and report names', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(routeSlug('/#/search'), 'search');
  assert.equal(routeSlug('/#/address/select'), 'address-select');
  assert.equal(routeSlug('/'), 'root');
});
