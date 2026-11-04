#!/usr/bin/env node
/**
 * The ZAP baseline lane: OWASP ZAP's baseline scan (a spider, then the passive scan of what it
 * fetched) of one pack, from the ZAP image pinned in docker/compose.yml (service `zap`, ADR 0011).
 *
 *   npm run lanes:zap -- --pack <pack> [--minutes <n>]      spider for <n> minutes (1)
 *
 * The target is the pack's base URL in the active environment ($QA_<PACK>_BASE_URL first), and only
 * an application on this machine is scanned: a loopback address (`localhost`, `127.0.0.1`, `::1`) or
 * a service of docker/compose.yml (`juice-shop`). Any other host is refused before Docker starts,
 * whatever the environment says, so a public site such as a pack's demo server is never scanned.
 * A loopback address is reached from the container through `host.docker.internal`.
 *
 * ZAP writes its reports to reports/zap/<pack>.json and .html. The lane then compares the alerts
 * with the pack's known alerts (`apps/<pack>/zap-known.json`: the alert's plugin id, its name, a
 * tracker key, an expiry and the reason it is accepted):
 *   new      an alert of risk Low or above that no entry covers, or whose entry expired: fails
 *   known    covered by an entry that has not expired: reported, does not fail
 *   info     an Informational alert no entry covers: reported, does not fail
 *   gone     an entry no alert matched: reported, so it can leave the file
 * and writes the comparison to reports/zap/<pack>-comparison.json.
 *
 * Exit codes: 0 no new alert; 1 a new alert, or the scan did not finish; 2 refused (usage, a target
 * that is not local, a broken known-alerts file).
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { REPO_ROOT } from './lib/cli.mjs';
import { containerUrl } from './lib/container.mjs';
import { activeEnvironment, packVariable } from './lib/qa-config.mjs';
import { describeExit, exitCodeOf, spawnFailure } from './lib/spawn.mjs';

export const USAGE = 'usage: npm run lanes:zap -- --pack <pack> [--minutes <n>]';

/** The compose service that runs the scan, and where its reports land in the repository. */
export const ZAP_SERVICE = 'zap';
export const REPORT_DIR = join('reports', 'zap');

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RISKS = ['Informational', 'Low', 'Medium', 'High'];

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

/**
 * The applications of docker/compose.yml, the only hosts besides loopback the lane scans: its
 * services outside the `lanes` profile, which holds the lanes' own images.
 */
export function composeServices(root = REPO_ROOT) {
  const compose = parse(readFileSync(join(root, 'docker', 'compose.yml'), 'utf8'));
  return Object.entries(compose?.services ?? {})
    .filter(([, service]) => !(service?.profiles ?? []).includes('lanes'))
    .map(([name]) => name);
}

/**
 * Why the lane must not scan `url`, or null when it may: it has to be http or https on a loopback
 * address or on a service of docker/compose.yml.
 */
export function targetProblem(url, services) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return `"${url}" is not a URL.`;
  }
  if (!['http:', 'https:'].includes(parsed.protocol))
    return `${url} is not an http or https address.`;
  const host = parsed.hostname.toLowerCase();
  if (LOOPBACK.has(host) || services.includes(host)) return null;
  return (
    `${parsed.host} is not on this machine. The ZAP lane scans only a loopback address or a ` +
    `service of docker/compose.yml (${services.join(', ')}); it never scans a public or shared host.`
  );
}

/**
 * The lane's plan from its arguments and the active environment: `{ pack, minutes, url, target }`
 * (`target` is what the container reaches), or `{ refusal }`.
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
  const problem = targetProblem(url, services);
  if (problem) return { refusal: `pack "${parsed.pack}": ${problem}` };
  return { ...parsed, url, target: containerUrl(url) };
}

/** The `docker compose` arguments of the scan. ZAP's own failure on warnings is off (`-I`). */
export function composeArgs(plan) {
  return [
    'compose',
    '-f',
    join('docker', 'compose.yml'),
    'run',
    '--rm',
    '--no-deps',
    ZAP_SERVICE,
    'zap-baseline.py',
    '-t',
    `${plan.target}/`,
    '-m',
    String(plan.minutes),
    '-J',
    `${plan.pack}.json`,
    '-r',
    `${plan.pack}.html`,
    '-I',
  ];
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

/**
 * Run a planned scan and return the lane's exit code. `io` holds what touches the machine, replaced
 * in tests: `docker(args)` returns a `spawnSync` result, `prepare(dir)` makes the report folder
 * writable for the container's user, `remove(file)`, `readJson(file)` the report or null,
 * `writeJson(file, value)`, `out`, `root`.
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
  const reportFile = join(dir, `${plan.pack}.json`);
  io.prepare(dir);
  // A report left by an earlier scan must never stand in for this one.
  io.remove(reportFile);
  io.out.log(
    `zap-lane: baseline scan of ${plan.pack} at ${plan.url} (from the container: ${plan.target})`,
  );
  const result = io.docker(composeArgs(plan));
  // ZAP's baseline exits 0 to 2 when the scan ran (1 a FAIL rule, 2 warnings, which -I keeps from
  // failing); 3 when it did not.
  const report = io.readJson(reportFile);
  if (spawnFailure(result) || exitCodeOf(result) > 2 || !report) {
    io.out.error(`zap-lane: the scan did not finish (${describeExit(result)}); no report to read.`);
    return 1;
  }
  const comparison = compareAlerts(alertsOf(report), known);
  io.writeJson(join(dir, `${plan.pack}-comparison.json`), comparison);
  io.out.log(`\nzap-lane: ${plan.pack} against ${knownFile}`);
  for (const line of summaryLines(comparison, knownFile)) io.out.log(`  ${line}`);
  return comparison.new.length > 0 ? 1 : 0;
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
  process.exit(runScan(plan, machineIo()));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
