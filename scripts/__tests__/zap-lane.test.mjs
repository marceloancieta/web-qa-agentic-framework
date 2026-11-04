// The ZAP baseline lane: only a local pack is scanned, and only through a disposable copy of its
// application that the lane starts and removes; the spider submits no form; the image is pinned; and
// the alerts are judged against the pack's known alerts the way the other baselines are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import {
  alertsOf,
  applicationsOf,
  compareAlerts,
  composeArgs,
  composeServices,
  loadKnownAlerts,
  methodsOf,
  parseArgs,
  planScan,
  runScan,
  scanServiceOf,
  summaryLines,
  targetProblem,
  ZAP_SERVICE,
  zapPlan,
} from '../zap-lane.mjs';

const APPLICATIONS = ['juice-shop'];
const SERVICES = {
  'juice-shop': { image: 'shop@sha256:1', ports: ['127.0.0.1:3000:3000'] },
  'juice-shop-scan': { profiles: ['zap'], image: 'shop@sha256:1', expose: ['3000'] },
  zap: { profiles: ['zap'], image: 'zap@sha256:2' },
};
const environment = (packs) => ({ source: 'qa-config.example.json', name: 'local', packs });
const compose = () => composeServices(REPO_ROOT);

test('the arguments: a pack is required, the spider minutes are bounded, nothing else passes', () => {
  assert.deepEqual(parseArgs(['--pack', 'juice-shop']), { pack: 'juice-shop', minutes: 1 });
  assert.deepEqual(parseArgs(['--', '--pack=juice-shop', '--minutes', '3']), {
    pack: 'juice-shop',
    minutes: 3,
  });
  assert.match(parseArgs([]).refusal, /--pack <pack>/);
  assert.match(parseArgs(['--pack', 'x', '--minutes', '0']).refusal, /from 1 to 10/);
  assert.match(parseArgs(['--pack', 'x', '--minutes', '2.5']).refusal, /from 1 to 10/);
  // A target of the user's choosing would get around both checks.
  assert.match(parseArgs(['--pack', 'x', '-t', 'https://example.com']).refusal, /does not take/);
});

test('a pack served from loopback or a compose application is local; any other host is refused', () => {
  for (const url of [
    'http://localhost:3000',
    'http://127.0.0.1:3000/app',
    'http://[::1]:3000',
    'http://juice-shop:3000',
  ])
    assert.equal(targetProblem(url, APPLICATIONS), null, url);
  for (const url of [
    'https://www.saucedemo.com',
    'http://example.com',
    'http://10.0.0.5:3000',
    'http://192.168.1.20:3000',
    'http://localhost.example.com',
    'http://juice-shop.example.com',
    'http://127.0.0.2.nip.io',
  ])
    assert.match(targetProblem(url, APPLICATIONS), /is not on this machine/, url);
  assert.match(targetProblem('ftp://localhost/', APPLICATIONS), /not an http or https/);
  assert.match(targetProblem('not a url', APPLICATIONS), /is not a URL/);
});

test('SauceDemo is never scanned: its base URL in the example configuration is public', () => {
  const example = JSON.parse(readFileSync(join(REPO_ROOT, 'qa-config.example.json'), 'utf8'));
  const plan = planScan(['--pack', 'saucedemo'], {
    environment: environment(example.app.environments.local.packs),
    services: compose(),
    env: {},
  });
  assert.match(plan.refusal, /^pack "saucedemo": www\.saucedemo\.com is not on this machine/);
});

test('the target is always the disposable copy, in a project of its own, never the base URL', () => {
  const packs = { 'juice-shop': { base_url: 'http://localhost:3000/' } };
  const plan = planScan(['--pack', 'juice-shop'], {
    environment: environment(packs),
    services: SERVICES,
    env: {},
  });
  assert.deepEqual(plan, {
    pack: 'juice-shop',
    minutes: 1,
    url: 'http://localhost:3000',
    project: 'web-qa-zap-juice-shop',
    service: 'juice-shop-scan',
    target: 'http://juice-shop-scan:3000',
  });
  // The variable still decides whether the pack is local, never where the scan goes.
  const shared = planScan(['--pack', 'juice-shop'], {
    environment: environment(packs),
    services: SERVICES,
    env: { QA_JUICE_SHOP_BASE_URL: 'http://juice-shop:3000' },
  });
  assert.equal(shared.target, 'http://juice-shop-scan:3000');
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
});

test('a pack without a disposable copy, or with one that publishes a port, is refused', () => {
  const packs = { 'juice-shop': { base_url: 'http://localhost:3000' } };
  const refusal = (services) =>
    planScan(['--pack', 'juice-shop'], { environment: environment(packs), services, env: {} })
      .refusal;
  const { 'juice-shop-scan': scan, ...without } = SERVICES;
  assert.match(refusal(without), /no service juice-shop-scan in the zap profile/);
  assert.match(
    refusal({ ...SERVICES, 'juice-shop-scan': { ...scan, ports: ['127.0.0.1:3000:3000'] } }),
    /never the instance other work uses/,
  );
  assert.match(
    refusal({ ...SERVICES, 'juice-shop-scan': { ...scan, profiles: [] } }),
    /zap profile/,
  );
  assert.match(refusal({ ...SERVICES, 'juice-shop-scan': { ...scan, expose: [] } }), /exposed/);
});

test('compose: the copy runs the image and health check of the application, on no host port', () => {
  const services = compose();
  assert.deepEqual(applicationsOf(services), ['juice-shop']);
  assert.deepEqual(scanServiceOf(services, 'juice-shop'), { name: 'juice-shop-scan', port: 3000 });
  const scan = services['juice-shop-scan'];
  assert.equal(scan.image, services['juice-shop'].image);
  assert.deepEqual(scan.healthcheck, services['juice-shop'].healthcheck);
  assert.equal(scan.ports, undefined);
  const zap = services[ZAP_SERVICE];
  assert.match(zap.image, /^zaproxy\/zap-stable:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/);
  assert.deepEqual(zap.profiles, ['zap']);
  assert.ok(zap.volumes.includes('../reports/zap:/zap/wrk:rw'));
});

const plan = {
  pack: 'juice-shop',
  minutes: 2,
  url: 'http://localhost:3000',
  project: 'web-qa-zap-juice-shop',
  service: 'juice-shop-scan',
  target: 'http://juice-shop-scan:3000',
};

test('the plan: the baseline jobs, a spider that submits no form, and a record of every message', () => {
  const { env, jobs } = zapPlan(plan);
  assert.deepEqual(env.contexts, [{ name: 'juice-shop', urls: ['http://juice-shop-scan:3000/'] }]);
  assert.deepEqual(
    jobs.map((job) => job.type),
    ['passiveScan-config', 'spider', 'passiveScan-wait', 'report', 'report', 'export'],
  );
  const spider = jobs.find((job) => job.type === 'spider').parameters;
  assert.equal(spider.processForm, false);
  assert.equal(spider.postForm, false);
  assert.equal(spider.maxDuration, 2);
  // `all`: the History source holds none of the spider's messages (an empty export, seen live).
  assert.deepEqual(jobs.at(-1).parameters, {
    type: 'har',
    source: 'all',
    fileName: '/zap/wrk/juice-shop-messages.har',
  });
});

test('every docker step names the scan project, so none of them touches another project', () => {
  for (const step of ['up', 'scan', 'down']) {
    const args = composeArgs(plan, step);
    assert.deepEqual(args.slice(0, 7), [
      'compose',
      '-p',
      'web-qa-zap-juice-shop',
      '-f',
      join('docker', 'compose.yml'),
      '--profile',
      'zap',
    ]);
  }
  assert.deepEqual(composeArgs(plan, 'up').slice(7), ['up', '-d', '--wait', 'juice-shop-scan']);
  assert.deepEqual(composeArgs(plan, 'down').slice(7), ['down', '--volumes', '--remove-orphans']);
  // -silent: no update check and no add-on download, only the pinned image's rules.
  assert.deepEqual(composeArgs(plan, 'scan').slice(-5), [
    'zap.sh',
    '-cmd',
    '-silent',
    '-autorun',
    '/zap/wrk/juice-shop-plan.yaml',
  ]);
});

const report = (alerts) => ({ site: [{ '@name': 'http://juice-shop-scan:3000', alerts }] });
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
const har = (...methods) => ({
  log: { entries: methods.map((method) => ({ request: { method } })) },
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

test('the messages of a scan are counted by method', () => {
  assert.deepEqual(methodsOf(har('GET', 'GET', 'head', 'POST')), { GET: 2, HEAD: 1, POST: 1 });
  assert.deepEqual(methodsOf({}), {});
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

/**
 * A machine stand-in. Each docker step exits with `status[step]` (0 by default); the scan step
 * writes `writes` (ZAP's report and message record) when given.
 */
function fakeIo(root, { status = {}, writes = null, knownAlerts = [] } = {}) {
  mkdirSync(join(root, 'apps', 'juice-shop'), { recursive: true });
  writeFileSync(join(root, 'apps', 'juice-shop', 'zap-known.json'), JSON.stringify(knownAlerts));
  const dir = join(root, 'reports', 'zap');
  const files = new Map([
    [join(dir, 'juice-shop.json'), { stale: true }],
    [join(dir, 'juice-shop-messages.har'), har('GET')],
  ]);
  const io = {
    root,
    steps: [],
    lines: [],
    out: { log: (line) => io.lines.push(line), error: (line) => io.lines.push(line) },
    prepare: () => undefined,
    remove: (file) => files.delete(file),
    docker: (args) => {
      const step = args.includes('up') ? 'up' : args.includes('down') ? 'down' : 'scan';
      io.steps.push(step);
      if (step === 'scan' && writes) {
        files.set(join(dir, 'juice-shop.json'), writes.report);
        files.set(join(dir, 'juice-shop-messages.har'), writes.har);
      }
      return { status: status[step] ?? 0 };
    },
    readJson: (file) => files.get(file) ?? null,
    writeJson: (file, value) => files.set(file, value),
    writeText: (file, text) => files.set(file, text),
    files,
  };
  return io;
}

const scanned = {
  report: report([alert('10038', 2, ['http://j/']), alert('10109', 0, ['http://j/'])]),
  har: har('GET', 'GET', 'HEAD'),
};

test('a scan that only read, with only known alerts, passes; the copy is started and removed', () => {
  const root = mkdtempSync(join(tmpdir(), 'zap-run-'));
  const io = fakeIo(root, { writes: scanned, knownAlerts: [known('10038')] });
  assert.equal(runScan(plan, io), 0);
  assert.deepEqual(io.steps, ['up', 'scan', 'down']);
  const comparison = io.files.get(join(root, 'reports', 'zap', 'juice-shop-comparison.json'));
  assert.deepEqual(comparison.methods, { GET: 2, HEAD: 1 });
  assert.equal(comparison.known[0].key, 'LOCAL-31');
  assert.match(
    io.files.get(join(root, 'reports', 'zap', 'juice-shop-plan.yaml')),
    /postForm: false/,
  );
  assert.ok(io.lines.includes('\nzap-lane: juice-shop: requests sent: GET 2, HEAD 1'));
});

test('a new alert fails, and so does a scan that sent anything but a read', () => {
  const root = mkdtempSync(join(tmpdir(), 'zap-run-'));
  const alerting = fakeIo(root, { writes: scanned });
  assert.equal(runScan(plan, alerting), 1);
  assert.ok(alerting.lines.includes('    10038 alert 10038 [Medium] x1, first at http://j/'));
  const posting = fakeIo(root, {
    writes: { ...scanned, har: har('GET', 'POST') },
    knownAlerts: [known('10038')],
  });
  assert.equal(runScan(plan, posting), 1);
  assert.ok(posting.lines.some((line) => /sent POST requests; it must only read/.test(line)));
  assert.deepEqual(posting.steps, ['up', 'scan', 'down']);
  // An empty record proves nothing: ZAP's first live export from the wrong source held 0 messages.
  const unrecorded = fakeIo(root, {
    writes: { ...scanned, har: har() },
    knownAlerts: [known('10038')],
  });
  assert.equal(runScan(plan, unrecorded), 1);
  assert.ok(unrecorded.lines.some((line) => /holds no message/.test(line)));
});

test('whatever fails, the copy is removed; files of an earlier scan never stand in', () => {
  const root = mkdtempSync(join(tmpdir(), 'zap-run-'));
  const unhealthy = fakeIo(root, { status: { up: 1 } });
  assert.equal(runScan(plan, unhealthy), 1);
  assert.deepEqual(unhealthy.steps, ['up', 'down']);
  const failed = fakeIo(root, { status: { scan: 1 } });
  assert.equal(runScan(plan, failed), 1);
  assert.deepEqual(failed.steps, ['up', 'scan', 'down']);
  // The scan exits 0 but writes nothing: the stale report and record were removed before it.
  const silent = fakeIo(root);
  assert.equal(runScan(plan, silent), 1);
  assert.match(silent.lines.at(-2), /wrote no juice-shop\.json, juice-shop-messages\.har/);
  const thrown = fakeIo(root, { writes: scanned, knownAlerts: [known('10038')] });
  thrown.writeJson = () => {
    throw new Error('disk full');
  };
  assert.throws(() => runScan(plan, thrown), /disk full/);
  assert.deepEqual(thrown.steps, ['up', 'scan', 'down']);
});

test('a removal that fails fails the lane, even after a clean scan', () => {
  const root = mkdtempSync(join(tmpdir(), 'zap-run-'));
  const io = fakeIo(root, {
    writes: scanned,
    knownAlerts: [known('10038')],
    status: { down: 1 },
  });
  assert.equal(runScan(plan, io), 1);
  assert.match(io.lines.at(-1), /removing web-qa-zap-juice-shop failed/);
});

test('a broken known-alerts file is refused before Docker starts', () => {
  const root = mkdtempSync(join(tmpdir(), 'zap-run-'));
  const io = fakeIo(root, { knownAlerts: [{ plugin: '10038' }] });
  assert.equal(runScan(plan, io), 2);
  assert.deepEqual(io.steps, []);
});

test('the known alerts of Juice Shop load, each with a tracker key and a reason', () => {
  const entries = loadKnownAlerts(join(REPO_ROOT, 'apps', 'juice-shop', 'zap-known.json'));
  assert.ok(entries.length > 0);
  for (const entry of entries) assert.match(entry.key, /^LOCAL-\d+$/, entry.plugin);
});
