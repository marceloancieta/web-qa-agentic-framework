#!/usr/bin/env node
/**
 * The ZAP baseline lane: a spider, then ZAP's passive scan of what it fetched, of a disposable copy
 * of one pack's application, from the ZAP image pinned in docker/compose.yml (ADR 0011).
 *
 *   npm run lanes:zap -- --pack <pack> [--minutes <n>]      spider for <n> minutes (1)
 *
 * The lane never scans the instance other work uses: the spider changes an application's state
 * (Juice Shop solves challenges and announces them). It starts the compose service `<pack>-scan`
 * (profile `zap`: the application's image, no published port) in a compose project of its own,
 * `web-qa-zap-<pack>`, scans it on that project's network, and removes the project afterwards,
 * whatever the scan did. A pack without such a service is refused.
 *
 * The pack must also be local: its base URL in the active environment ($QA_<PACK>_BASE_URL first)
 * has to be a loopback address or an application of docker/compose.yml. Any other host is refused
 * before Docker starts, so a public site such as a pack's demo server is never scanned.
 *
 * The scan is ZAP's Automation Framework plan the lane writes to reports/zap/<pack>-plan.yaml: the
 * jobs of ZAP's baseline scan, with the spider's form handling off (`processForm` and `postForm`
 * false), so it submits no form, by GET or by POST. ZAP exports every message it sent to
 * reports/zap/<pack>-messages.har, and a request with any method but GET, HEAD or OPTIONS fails the
 * lane. ZAP writes its reports to reports/zap/<pack>.json and .html; the lane compares the alerts
 * with the pack's known alerts (`apps/<pack>/zap-known.json`: the alert's plugin id, its name, a
 * tracker key, an expiry and the reason it is accepted):
 *   new      an alert of risk Low or above that no entry covers, or whose entry expired: fails
 *   known    covered by an entry that has not expired: reported, does not fail
 *   info     an Informational alert no entry covers: reported, does not fail
 *   gone     an entry no alert matched: reported, so it can leave the file
 * and writes the comparison, with the methods the scan sent, to reports/zap/<pack>-comparison.json.
 *
 * Exit codes: 0 no new alert, and only reads; 1 a new alert, a request that writes, the scan or the
 * disposable application did not run, or it was not removed; 2 refused (usage, a target that is not
 * local, no disposable service, a broken known-alerts file).
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse, stringify } from 'yaml';
import { REPO_ROOT } from './lib/cli.mjs';
import { activeEnvironment, packVariable } from './lib/qa-config.mjs';
import { describeExit, exitCodeOf, spawnFailure } from './lib/spawn.mjs';

export const USAGE = 'usage: npm run lanes:zap -- --pack <pack> [--minutes <n>]';

/** The compose service that runs the scan, its profile, and where its files land. */
export const ZAP_SERVICE = 'zap';
export const ZAP_PROFILE = 'zap';
export const REPORT_DIR = join('reports', 'zap');
const CONTAINER_DIR = '/zap/wrk';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RISKS = ['Informational', 'Low', 'Medium', 'High'];
/** The methods a scan that only reads sends. */
export const READ_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/** The lane's arguments: `{ pack, minutes }`, or `{ refusal }`. */
export function parseArgs(args) {
  const rest = args[0] === '--' ? args.slice(1) : args;
  let pack = null;
  let minutes = 1;
  for (let i = 0; i < rest.length; i += 1) {
    const [option, inline] = rest[i].split('=', 2);
    const value = () => inline ?? rest[++i] ?? '';
    if (option === '--pack') pack = value();
    else if (option === '--minutes') {
      const raw = value();
      minutes = Number(raw);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10)
        return { refusal: `--minutes must be a whole number from 1 to 10, got "${raw}".` };
    } else return { refusal: `the ZAP lane does not take "${rest[i]}".` };
  }
  if (!pack) return { refusal: 'name the pack to scan with --pack <pack>.' };
  return { pack, minutes };
}

/** The services of docker/compose.yml, by name. */
export function composeServices(root = REPO_ROOT) {
  return parse(readFileSync(join(root, 'docker', 'compose.yml'), 'utf8'))?.services ?? {};
}

/**
 * The applications of docker/compose.yml, the only hosts besides loopback a pack's base URL may
 * name: its services outside any profile (the lanes' images and the disposable copies have one).
 */
export function applicationsOf(services) {
  return Object.entries(services)
    .filter(([, service]) => !(service?.profiles ?? []).length)
    .map(([name]) => name);
}

/**
 * The disposable copy of a pack's application, `{ name, port }`: the service `<pack>-scan` of the
 * `zap` profile, with the port it exposes on the compose network and none published. Null for a
 * pack without such a service.
 */
export function scanServiceOf(services, pack) {
  const name = `${pack}-scan`;
  const service = services[name];
  if (!service || !(service.profiles ?? []).includes(ZAP_PROFILE) || service.ports) return null;
  const port = Number(String(service.expose?.[0] ?? '').split('/')[0]);
  return Number.isInteger(port) && port > 0 ? { name, port } : null;
}

/**
 * Why the lane must not scan a pack whose base URL is `url`, or null when it may: it has to be http
 * or https on a loopback address or on an application of docker/compose.yml.
 */
export function targetProblem(url, applications) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return `"${url}" is not a URL.`;
  }
  if (!['http:', 'https:'].includes(parsed.protocol))
    return `${url} is not an http or https address.`;
  const host = parsed.hostname.toLowerCase();
  if (LOOPBACK.has(host) || applications.includes(host)) return null;
  return (
    `${parsed.host} is not on this machine. The ZAP lane scans only a pack served from a loopback ` +
    `address or an application of docker/compose.yml (${applications.join(', ')}); it never scans ` +
    'a public or shared host.'
  );
}

/**
 * The lane's plan from its arguments, the active environment and the compose services:
 * `{ pack, minutes, url, project, service, target }` (`target` is the disposable copy's address on
 * the compose network), or `{ refusal }`.
 */
export function planScan(args, { environment, services, env = process.env }) {
  const parsed = parseArgs(args);
  if (parsed.refusal) return parsed;
  const entry = environment.packs[parsed.pack];
  if (!entry) {
    return {
      refusal: `${environment.source} has no app.environments.${environment.name}.packs.${parsed.pack}.`,
    };
  }
  const url = (env[packVariable(parsed.pack, 'BASE_URL')] || entry.base_url || '').replace(
    /\/+$/,
    '',
  );
  const problem = targetProblem(url, applicationsOf(services));
  if (problem) return { refusal: `pack "${parsed.pack}": ${problem}` };
  const scan = scanServiceOf(services, parsed.pack);
  if (!scan) {
    return {
      refusal:
        `docker/compose.yml has no service ${parsed.pack}-scan in the ${ZAP_PROFILE} profile, with ` +
        'an exposed port and none published: the lane scans only a disposable copy of the ' +
        'application, never the instance other work uses.',
    };
  }
  return {
    ...parsed,
    url,
    project: `web-qa-zap-${parsed.pack}`,
    service: scan.name,
    target: `http://${scan.name}:${scan.port}`,
  };
}

/** The files of a scan in reports/zap: the plan, ZAP's reports and its record of the messages. */
export function scanFiles(pack) {
  return {
    plan: `${pack}-plan.yaml`,
    json: `${pack}.json`,
    html: `${pack}.html`,
    messages: `${pack}-messages.har`,
    comparison: `${pack}-comparison.json`,
  };
}

/**
 * ZAP's Automation Framework plan: the jobs of its baseline scan (passive scan settings, spider,
 * wait for the passive scan, reports), with the spider's form handling off, then an export of every
 * message the scan sent.
 */
export function zapPlan(plan) {
  const files = scanFiles(plan.pack);
  const url = `${plan.target}/`;
  const report = (template, reportFile) => ({
    type: 'report',
    parameters: {
      template,
      reportDir: `${CONTAINER_DIR}/`,
      reportFile,
      reportTitle: `ZAP baseline scan of ${plan.pack}`,
    },
  });
  return {
    env: {
      contexts: [{ name: plan.pack, urls: [url] }],
      parameters: { failOnError: true, failOnWarning: false, progressToStdout: true },
    },
    jobs: [
      { type: 'passiveScan-config', parameters: { maxAlertsPerRule: 10, enableTags: false } },
      {
        type: 'spider',
        parameters: {
          context: plan.pack,
          url,
          maxDuration: plan.minutes,
          // No form is submitted, by POST or by GET: a form is how a page writes, and a GET form
          // of a server-rendered page would be the only thing the spider loses.
          processForm: false,
          postForm: false,
        },
      },
      { type: 'passiveScan-wait', parameters: { maxDuration: 5 } },
      report('traditional-json', files.json),
      report('traditional-html', files.html),
      // Every message of the session, the spider's included (the History source holds only the
      // messages a person would see in ZAP's History tab, none of the spider's).
      {
        type: 'export',
        parameters: { type: 'har', source: 'all', fileName: `${CONTAINER_DIR}/${files.messages}` },
      },
    ],
  };
}

/** The `docker compose` arguments of one step, in the scan's own project. */
export function composeArgs(plan, step) {
  const base = ['compose', '-p', plan.project, '-f', join('docker', 'compose.yml')];
  const profile = ['--profile', ZAP_PROFILE];
  if (step === 'up') return [...base, ...profile, 'up', '-d', '--wait', plan.service];
  if (step === 'down') return [...base, ...profile, 'down', '--volumes', '--remove-orphans'];
  return [
    ...base,
    ...profile,
    'run',
    '--rm',
    '--no-deps',
    ZAP_SERVICE,
    'zap.sh',
    '-cmd',
    // No update check and no add-on download: the scan runs the rules of the pinned image only.
    '-silent',
    '-autorun',
    `${CONTAINER_DIR}/${scanFiles(plan.pack).plan}`,
  ];
}

/** The requests of a HAR record, counted by method. */
export function methodsOf(har) {
  const counts = {};
  for (const entry of har?.log?.entries ?? []) {
    const method = String(entry?.request?.method ?? '?').toUpperCase();
    counts[method] = (counts[method] ?? 0) + 1;
  }
  return counts;
}

/** The known alerts of a pack, checked entry by entry. A missing file is an empty list. */
export function loadKnownAlerts(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const entries = JSON.parse(text);
  if (!Array.isArray(entries)) throw new Error(`${file}: expected a list of known alerts.`);
  const problems = entries.flatMap((entry, index) => [
    ...['plugin', 'name', 'key', 'expires', 'reason']
      .filter((field) => typeof entry?.[field] !== 'string' || !entry[field].trim())
      .map((field) => `entry ${index} has no ${field}`),
    ...(typeof entry?.plugin === 'string' && !/^\d+$/.test(entry.plugin)
      ? [`entry ${index} plugin is not a ZAP plugin id`]
      : []),
    ...(typeof entry?.expires === 'string' && !DATE.test(entry.expires)
      ? [`entry ${index} expires is not YYYY-MM-DD`]
      : []),
  ]);
  if (problems.length > 0) throw new Error(`${file}: ${problems.join('; ')}.`);
  return entries;
}

/** The alerts of a ZAP JSON report, one per plugin id: `{ plugin, name, risk, count, uris }`. */
export function alertsOf(report) {
  const byPlugin = new Map();
  for (const site of report?.site ?? []) {
    for (const alert of site.alerts ?? []) {
      const plugin = String(alert.pluginid);
      const found = byPlugin.get(plugin) ?? {
        plugin,
        name: alert.name ?? alert.alert ?? '',
        risk: Number(alert.riskcode ?? 0),
        count: 0,
        uris: [],
      };
      const instances = alert.instances ?? [];
      found.count += Number(alert.count ?? instances.length);
      for (const { uri } of instances) if (uri && !found.uris.includes(uri)) found.uris.push(uri);
      byPlugin.set(plugin, found);
    }
  }
  return [...byPlugin.values()];
}

/** Split the alerts into new, known and informational, and list the entries no alert matched. */
export function compareAlerts(alerts, known, today = new Date().toISOString().slice(0, 10)) {
  const result = { new: [], known: [], info: [], gone: [] };
  for (const alert of alerts) {
    const entry = known.find((e) => e.plugin === alert.plugin);
    if (entry && entry.expires >= today) result.known.push({ ...alert, key: entry.key });
    else if (alert.risk >= 1) result.new.push(entry ? { ...alert, expired: entry } : alert);
    else result.info.push(alert);
  }
  result.gone = known.filter((entry) => !alerts.some((alert) => alert.plugin === entry.plugin));
  return result;
}

/** The lines the lane prints after the scan. */
export function summaryLines(comparison, knownFile) {
  const describe = (alert) =>
    `${alert.plugin} ${alert.name} [${RISKS[alert.risk] ?? alert.risk}] x${alert.count}`;
  const list = (items, line) => (items.length ? items.map(line) : ['none']);
  return [
    'new (fails the lane):',
    ...list(comparison.new, (a) => {
      const expired = a.expired ? ` (entry ${a.expired.key} expired ${a.expired.expires})` : '';
      return `  ${describe(a)}${expired}, first at ${a.uris[0] ?? '?'}`;
    }),
    'known:',
    ...list(comparison.known, (a) => `  ${describe(a)} (${a.key})`),
    'informational:',
    ...list(comparison.info, (a) => `  ${describe(a)}`),
    'gone (no alert matched; the entry can leave the file):',
    ...list(comparison.gone, (e) => `  ${e.plugin} ${e.name} (${e.key})`),
    ...(comparison.new.length
      ? [
          `Fix them, or file each one and add it to ${knownFile} with its tracker key, an expiry ` +
            'and the reason it is accepted.',
        ]
      : []),
  ].map((line) => (line === 'none' ? '  none' : line));
}

/** Judge a finished scan: the methods it sent, then its alerts. Returns the exit code. */
function judge(plan, io, dir, known, knownFile) {
  const files = scanFiles(plan.pack);
  const report = io.readJson(join(dir, files.json));
  const har = io.readJson(join(dir, files.messages));
  if (!report || !har) {
    const missing = [!report && files.json, !har && files.messages].filter(Boolean).join(', ');
    io.out.error(`zap-lane: the scan wrote no ${missing}; it did not finish.`);
    return 1;
  }
  const methods = methodsOf(har);
  if (Object.keys(methods).length === 0) {
    io.out.error(
      `zap-lane: ${files.messages} holds no message, so nothing shows the scan only read; ` +
        'the export did not record the scan.',
    );
    return 1;
  }
  const writes = Object.keys(methods).filter((method) => !READ_METHODS.includes(method));
  const comparison = { methods, ...compareAlerts(alertsOf(report), known) };
  io.writeJson(join(dir, files.comparison), comparison);
  const sent = Object.entries(methods).map(([method, count]) => `${method} ${count}`);
  io.out.log(`\nzap-lane: ${plan.pack}: requests sent: ${sent.join(', ') || 'none'}`);
  if (writes.length > 0) {
    io.out.error(
      `zap-lane: the scan sent ${writes.join(', ')} requests; it must only read. See ${files.messages}.`,
    );
  }
  io.out.log(`zap-lane: ${plan.pack} against ${knownFile}`);
  for (const line of summaryLines(comparison, knownFile)) io.out.log(`  ${line}`);
  return comparison.new.length > 0 || writes.length > 0 ? 1 : 0;
}

/**
 * Run a planned scan and return the lane's exit code. `io` holds what touches the machine, replaced
 * in tests: `docker(args)` returns a `spawnSync` result, `prepare(dir)` makes the report folder
 * writable for the container's user, `remove(file)`, `readJson(file)` a file or null,
 * `writeJson(file, value)`, `writeText(file, text)`, `out`, `root`.
 */
export function runScan(plan, io) {
  const root = io.root ?? REPO_ROOT;
  const knownFile = join('apps', plan.pack, 'zap-known.json');
  let known;
  try {
    known = loadKnownAlerts(join(root, knownFile));
  } catch (error) {
    io.out.error(`zap-lane: refused: ${error.message}`);
    return 2;
  }
  const dir = join(root, REPORT_DIR);
  const files = scanFiles(plan.pack);
  io.prepare(dir);
  // Files an earlier scan left must never stand in for this one.
  for (const file of Object.values(files)) io.remove(join(dir, file));
  io.writeText(join(dir, files.plan), stringify(zapPlan(plan)));
  io.out.log(`zap-lane: ${plan.pack}: starting a disposable ${plan.service} (${plan.project})`);
  let code;
  let removed;
  try {
    code = startAndScan(plan, io, dir, known, knownFile);
  } finally {
    // Whatever the scan did, a thrown error included: the disposable copy never outlives the lane.
    const down = io.docker(composeArgs(plan, 'down'));
    removed = exitCodeOf(down) === 0;
    if (removed) io.out.log(`zap-lane: ${plan.project} removed.`);
    else {
      io.out.error(
        `zap-lane: removing ${plan.project} failed (${describeExit(down)}); remove it with ` +
          `docker compose -p ${plan.project} -f docker/compose.yml --profile ${ZAP_PROFILE} down.`,
      );
    }
  }
  // A failed removal fails the lane, whatever the scan found.
  return removed ? code : Math.max(code, 1);
}

/** Start the disposable application, scan it and judge the scan. Returns the exit code. */
function startAndScan(plan, io, dir, known, knownFile) {
  const up = io.docker(composeArgs(plan, 'up'));
  if (exitCodeOf(up) !== 0) {
    io.out.error(`zap-lane: ${plan.service} did not start healthy (${describeExit(up)}).`);
    return 1;
  }
  io.out.log(`zap-lane: scanning ${plan.target} for ${plan.minutes} minute(s) of spidering`);
  const scan = io.docker(composeArgs(plan, 'scan'));
  // The Automation Framework exits 0, or 2 with warnings; 1 when a job failed.
  if (spawnFailure(scan) || ![0, 2].includes(exitCodeOf(scan))) {
    io.out.error(`zap-lane: the scan failed (${describeExit(scan)}).`);
    return 1;
  }
  return judge(plan, io, dir, known, knownFile);
}

function machineIo() {
  return {
    root: REPO_ROOT,
    out: console,
    docker: (args) => spawnSync('docker', args, { cwd: REPO_ROOT, stdio: 'inherit' }),
    // The image runs as its own user, which a Linux host does not map to the repository's owner.
    prepare: (dir) => {
      mkdirSync(dir, { recursive: true });
      chmodSync(dir, 0o777);
    },
    remove: (file) => rmSync(file, { force: true }),
    readJson: (file) => {
      try {
        return JSON.parse(readFileSync(file, 'utf8'));
      } catch {
        return null;
      }
    },
    writeJson: (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`),
    writeText: (file, text) => writeFileSync(file, text),
  };
}

function main() {
  const plan = planScan(process.argv.slice(2), {
    environment: activeEnvironment(REPO_ROOT),
    services: composeServices(REPO_ROOT),
  });
  if (plan.refusal) {
    console.error(`zap-lane: refused: ${plan.refusal}`);
    console.error(USAGE);
    process.exit(2);
  }
  // Ctrl+C stops the scan, not the removal of the disposable application after it.
  process.on('SIGINT', () => console.error('zap-lane: interrupted; removing the scan project.'));
  process.exit(runScan(plan, machineIo()));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
