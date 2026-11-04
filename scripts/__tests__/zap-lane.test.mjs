// The ZAP baseline lane: only an application on this machine is scanned, the image is pinned, and
// the alerts are judged against the pack's known alerts the way the other baselines are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { REPO_ROOT } from '../lib/cli.mjs';
import {
  alertsOf,
  compareAlerts,
  composeArgs,
  composeServices,
  loadKnownAlerts,
  parseArgs,
  planScan,
  runScan,
  summaryLines,
  targetProblem,
  ZAP_SERVICE,
} from '../zap-lane.mjs';

const SERVICES = ['juice-shop'];
const environment = (packs) => ({ source: 'qa-config.example.json', name: 'local', packs });

test('the arguments: a pack is required, the spider minutes are bounded, nothing else passes', () => {
  assert.deepEqual(parseArgs(['--pack', 'juice-shop']), { pack: 'juice-shop', minutes: 1 });
  assert.deepEqual(parseArgs(['--', '--pack=juice-shop', '--minutes', '3']), {
    pack: 'juice-shop',
    minutes: 3,
  });
  assert.match(parseArgs([]).refusal, /--pack <pack>/);
  assert.match(parseArgs(['--pack', 'x', '--minutes', '0']).refusal, /from 1 to 10/);
  assert.match(parseArgs(['--pack', 'x', '--minutes', '2.5']).refusal, /from 1 to 10/);
  // A target of the user's choosing would get around the check of the pack's base URL.
  assert.match(parseArgs(['--pack', 'x', '-t', 'https://example.com']).refusal, /does not take/);
});

test('a loopback address or a compose application is scanned; any other host is refused', () => {
  for (const url of [
    'http://localhost:3000',
    'http://127.0.0.1:3000/app',
    'http://[::1]:3000',
    'http://juice-shop:3000',
  ])
    assert.equal(targetProblem(url, SERVICES), null, url);
  for (const url of [
    'https://www.saucedemo.com',
    'http://example.com',
    'http://10.0.0.5:3000',
    'http://192.168.1.20:3000',
    'http://localhost.example.com',
    'http://juice-shop.example.com',
    'http://127.0.0.2.nip.io',
  ])
    assert.match(targetProblem(url, SERVICES), /is not on this machine/, url);
  assert.match(targetProblem('ftp://localhost/', SERVICES), /not an http or https/);
  assert.match(targetProblem('not a url', SERVICES), /is not a URL/);
});

test("the lanes' own images are not targets: the applications of compose are", () => {
  assert.deepEqual(composeServices(REPO_ROOT), ['juice-shop']);
});

test('SauceDemo is never scanned: its base URL in the example configuration is public', () => {
  const example = JSON.parse(readFileSync(join(REPO_ROOT, 'qa-config.example.json'), 'utf8'));
  const plan = planScan(['--pack', 'saucedemo'], {
    environment: environment(example.app.environments.local.packs),
    services: composeServices(REPO_ROOT),
    env: {},
  });
  assert.match(plan.refusal, /^pack "saucedemo": www\.saucedemo\.com is not on this machine/);
});

test("the target is the pack's base URL, its variable first, reached from the container", () => {
  const packs = { 'juice-shop': { base_url: 'http://localhost:3000/' } };
  const plan = planScan(['--pack', 'juice-shop'], {
    environment: environment(packs),
    services: SERVICES,
    env: {},
  });
  assert.equal(plan.url, 'http://localhost:3000');
  assert.equal(plan.target, 'http://host.docker.internal:3000');
  const ci = planScan(['--pack', 'juice-shop'], {
    environment: environment(packs),
    services: SERVICES,
    env: { QA_JUICE_SHOP_BASE_URL: 'http://juice-shop:3000' },
  });
  assert.equal(ci.target, 'http://juice-shop:3000');
  const moved = planScan(['--pack', 'juice-shop'], {
    environment: environment(packs),
    services: SERVICES,
    env: { QA_JUICE_SHOP_BASE_URL: 'https://shop.example.com' },
  });
  assert.match(moved.refusal, /shop\.example\.com is not on this machine/);
  const missing = planScan(['--pack', 'toolshop'], {
    environment: environment(packs),
    services: SERVICES,
    env: {},
  });
  assert.match(missing.refusal, /has no app\.environments\.local\.packs\.toolshop/);
  assert.deepEqual(composeArgs({ ...plan, pack: 'juice-shop', minutes: 2 }).slice(-11), [
    ZAP_SERVICE,
    'zap-baseline.py',
    '-t',
    'http://host.docker.internal:3000/',
    '-m',
    '2',
    '-J',
    'juice-shop.json',
    '-r',
    'juice-shop.html',
    '-I',
  ]);
});

test('the ZAP image is pinned by digest, writes its reports to reports/zap and runs only on demand', () => {
  const service = parse(readFileSync(join(REPO_ROOT, 'docker', 'compose.yml'), 'utf8')).services[
    ZAP_SERVICE
  ];
  assert.match(service.image, /^zaproxy\/zap-stable:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/);
  assert.deepEqual(service.profiles, ['lanes']);
  assert.ok(service.volumes.includes('../reports/zap:/zap/wrk:rw'));
});

const report = (alerts) => ({ site: [{ '@name': 'http://juice-shop:3000', alerts }] });
const alert = (pluginid, riskcode, uris, name = `alert ${pluginid}`) => ({
  pluginid,
  name,
  riskcode: String(riskcode),
  count: String(uris.length),
  instances: uris.map((uri) => ({ uri })),
});
const known = (plugin, expires = '2099-01-01') => ({
  plugin,
  name: `alert ${plugin}`,
  key: 'LOCAL-31',
  expires,
  reason: 'deliberate',
});

test('alerts are merged per plugin, and judged: new, known, informational, expired and gone', () => {
  const alerts = alertsOf(
    report([
      alert('10038', 2, ['http://j/', 'http://j/ftp']),
      alert('90004', 1, ['http://j/']),
      alert('90004', 1, ['http://j/sitemap.xml']),
      alert('10098', 2, ['http://j/']),
      alert('10109', 0, ['http://j/']),
      alert('10063', 1, ['http://j/']),
    ]),
  );
  assert.deepEqual(
    alerts.find((a) => a.plugin === '90004'),
    {
      plugin: '90004',
      name: 'alert 90004',
      risk: 1,
      count: 2,
      uris: ['http://j/', 'http://j/sitemap.xml'],
    },
  );
  const comparison = compareAlerts(
    alerts,
    [known('10038'), known('90004'), known('10063', '2026-01-01'), known('10020')],
    '2026-11-03',
  );
  assert.deepEqual(
    comparison.known.map((a) => a.plugin),
    ['10038', '90004'],
  );
  assert.deepEqual(
    comparison.new.map((a) => a.plugin),
    ['10098', '10063'],
  );
  assert.equal(comparison.new[1].expired.expires, '2026-01-01');
  assert.deepEqual(
    comparison.info.map((a) => a.plugin),
    ['10109'],
  );
  assert.deepEqual(
    comparison.gone.map((e) => e.plugin),
    ['10020'],
  );
  const lines = summaryLines(comparison, 'apps/juice-shop/zap-known.json');
  assert.ok(lines.includes('  10098 alert 10098 [Medium] x1, first at http://j/'));
  assert.ok(
    lines.includes(
      '  10063 alert 10063 [Low] x1 (entry LOCAL-31 expired 2026-01-01), first at http://j/',
    ),
  );
  assert.ok(lines.at(-1).startsWith('Fix them, or file each one'));
});

test('a known-alerts file is refused entry by entry: every entry gives its reason', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zap-known-'));
  assert.deepEqual(loadKnownAlerts(join(dir, 'none.json')), []);
  const file = join(dir, 'zap-known.json');
  writeFileSync(
    file,
    JSON.stringify([
      known('10038'),
      { ...known('10098'), reason: ' ' },
      { ...known('CSP'), expires: '03/02/2027' },
    ]),
  );
  assert.throws(
    () => loadKnownAlerts(file),
    /entry 1 has no reason; entry 2 plugin is not a ZAP plugin id; entry 2 expires is not YYYY-MM-DD\.$/,
  );
});

/** A machine stand-in: Docker writes `report` (or nothing) and exits with `status`. */
function fakeIo(root, { status = 2, writes = null, knownAlerts = [] } = {}) {
  mkdirSync(join(root, 'apps', 'juice-shop'), { recursive: true });
  writeFileSync(join(root, 'apps', 'juice-shop', 'zap-known.json'), JSON.stringify(knownAlerts));
  const files = new Map([[join(root, 'reports', 'zap', 'juice-shop.json'), { stale: true }]]);
  const io = {
    root,
    calls: [],
    lines: [],
    out: { log: (line) => io.lines.push(line), error: (line) => io.lines.push(line) },
    prepare: (dir) => io.calls.push(`prepare ${dir}`),
    remove: (file) => files.delete(file),
    docker: (args) => {
      io.calls.push(`docker ${args.join(' ')}`);
      if (writes) files.set(join(root, 'reports', 'zap', 'juice-shop.json'), writes);
      return { status };
    },
    readJson: (file) => files.get(file) ?? null,
    writeJson: (file, value) => files.set(file, value),
    files,
  };
  return io;
}

const plan = {
  pack: 'juice-shop',
  minutes: 1,
  url: 'http://localhost:3000',
  target: 'http://host.docker.internal:3000',
};

test('a scan with only known alerts passes; a new one fails; the comparison is written', () => {
  const root = mkdtempSync(join(tmpdir(), 'zap-run-'));
  const scanned = report([alert('10038', 2, ['http://j/']), alert('10109', 0, ['http://j/'])]);
  const passing = fakeIo(root, { writes: scanned, knownAlerts: [known('10038')] });
  assert.equal(runScan(plan, passing), 0);
  assert.ok(passing.calls.some((call) => call.includes('zap-baseline.py -t http://host.docker')));
  assert.equal(
    passing.files.get(join(root, 'reports', 'zap', 'juice-shop-comparison.json')).known[0].key,
    'LOCAL-31',
  );
  const failing = fakeIo(root, { writes: scanned, knownAlerts: [] });
  assert.equal(runScan(plan, failing), 1);
  assert.ok(failing.lines.includes('    10038 alert 10038 [Medium] x1, first at http://j/'));
});

test('a scan that did not finish fails, and an earlier report never stands in for it', () => {
  const root = mkdtempSync(join(tmpdir(), 'zap-run-'));
  const noReport = fakeIo(root, { status: 0 });
  assert.equal(runScan(plan, noReport), 1);
  assert.match(noReport.lines.at(-1), /the scan did not finish \(exit 0\)/);
  const crashed = fakeIo(root, { status: 3, writes: report([]) });
  assert.equal(runScan(plan, crashed), 1);
  assert.match(crashed.lines.at(-1), /did not finish \(exit 3\)/);
});

test('a broken known-alerts file is refused before Docker starts', () => {
  const root = mkdtempSync(join(tmpdir(), 'zap-run-'));
  const io = fakeIo(root, { knownAlerts: [{ plugin: '10038' }] });
  assert.equal(runScan(plan, io), 2);
  assert.ok(!io.calls.some((call) => call.startsWith('docker')));
});

test('the known alerts of Juice Shop load, each with a tracker key and a reason', () => {
  const entries = loadKnownAlerts(join(REPO_ROOT, 'apps', 'juice-shop', 'zap-known.json'));
  assert.ok(entries.length > 0);
  for (const entry of entries) assert.match(entry.key, /^LOCAL-\d+$/, entry.plugin);
});
