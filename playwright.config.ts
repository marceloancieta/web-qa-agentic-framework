import { join } from 'node:path';
import {
  defineConfig,
  type PlaywrightTestProject,
  type ReporterDescription,
} from '@playwright/test';
import { appPacks, loadAppPack } from './helpers/app-pack';
import { configuredPacks, loadLocalEnvFile, loadRuntime, loadSettings } from './helpers/config';
import { DEVICE_PROJECTS, deviceUse, type DeviceName } from './helpers/devices';
import { jsonReportFile, slowMoMs, testTimeoutMs } from './helpers/run-options';
import { runId } from './scripts/lib/log.mjs';
import { projectTagFilter } from './scripts/lib/tags.mjs';

loadLocalEnvFile();

// Every run has an id: the one CI or the caller set in QA_RUN_ID, which shards of one run share,
// or a new one. Workers inherit it, so each result carries it as its `run` label, and the JSON
// report records it for the quality gate.
const run = runId();

const settings = loadSettings();
const configured = new Set(configuredPacks());

// QA_SLOWMO=800 waits 800 ms before each browser action, to follow a headed run by eye; the test
// timeout grows with it so a slowed case is not cut short.
const slowMo = slowMoMs();

// With `--list` nothing executes, so only the console reporter is kept: a results reporter would
// file every listed case as skipped.
const isListing = process.argv.includes('--list');

// The unit tests of the core are not a run of the suite, so they leave the suite's report alone.
const unitOnly = process.argv.includes('--project=unit');

// Machine-readable reports are added through variables, never `--reporter`, which would replace the
// configured reporters and drop the evidence. The JSON report the quality gate reads is always
// written, to reports/playwright.json unless QA_JSON_REPORT names another file; QA_BLOB_REPORT=1
// adds the blob report each shard of a CI run writes and `npm run ci:merge` joins.
const extraReporters: ReporterDescription[] = [
  ...(unitOnly ? [] : [['json', { outputFile: jsonReportFile() }] as ReporterDescription]),
  ...(process.env.QA_BLOB_REPORT === '1'
    ? [['blob', { outputDir: 'blob-report' }] as ReporterDescription]
    : []),
  ...(process.env.QA_JUNIT_REPORT
    ? [['junit', { outputFile: process.env.QA_JUNIT_REPORT }] as ReporterDescription]
    : []),
];

// Copies of this checkout that must not be collected: worktrees made for parallel agent work, and
// generated output.
const escapedRoot = __dirname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\\|\//g, '[\\\\/]');
const notThisCheckout = ['\\.claude[\\\\/]worktrees', 'reports', 'scripts[\\\\/]__fixtures__'].map(
  (dir) => new RegExp(`^${escapedRoot}[\\\\/]${dir}[\\\\/]`),
);

// Retries hide flakiness, so they are off unless a lane asks for them.
function retries(): number {
  const raw = process.env.QA_RETRIES ?? '0';
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`QA_RETRIES must be a whole number of at least 0, got "${raw}".`);
  }
  return value;
}

// Traces record what is typed and every response. The redaction reporter removes the run's known
// secrets from them after the run (CORE-18); QA_TRACE=off keeps traces out of artifacts entirely.
function traceMode(): 'off' | 'on' | 'retain-on-failure' {
  const raw = process.env.QA_TRACE ?? 'retain-on-failure';
  if (raw === 'off' || raw === 'on' || raw === 'retain-on-failure') return raw;
  throw new Error(`QA_TRACE must be off, on or retain-on-failure, got "${raw}".`);
}

// One preflight project per pack, then one project per device the environment runs, named
// `<pack>-<device>`: `--project=juice-shop-*` runs one pack, `--project=*-mobile-chrome` one device.
// A pack the environment does not configure still gets its projects, without a base URL: its
// preflight then fails with the reason, and only when the pack is selected.
function packProjects(pack: string): PlaywrightTestProject[] {
  const app = loadAppPack(join(__dirname, 'apps', pack));
  const baseURL = configured.has(pack) ? `${loadRuntime(pack).baseUrl}/` : undefined;
  const preflight: PlaywrightTestProject = {
    name: `preflight-${pack}`,
    testDir: './fixtures',
    testMatch: 'preflight.setup.ts',
    metadata: { pack },
  };
  const deviceProject = (device: DeviceName): PlaywrightTestProject => {
    const { formFactor } = DEVICE_PROJECTS[device];
    return {
      name: `${pack}-${device}`,
      testDir: `./apps/${pack}`,
      testMatch: '**/specs/**/*.spec.ts',
      dependencies: [preflight.name as string],
      metadata: { pack, device, formFactor },
      use: {
        ...deviceUse(device),
        ...(baseURL ? { baseURL } : {}),
        testIdAttribute: app.testIdAttribute ?? 'data-testid',
      },
      ...(app.workers ? { workers: app.workers } : {}),
      ...projectTagFilter(formFactor, process.env, deviceUse(device).defaultBrowserType),
    };
  };
  return [preflight, ...settings.devices.map(deviceProject)];
}

export default defineConfig({
  // Spec files are spread over the workers; inside a file the cases keep their order on one worker,
  // and a failure does not stop the cases after it.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  metadata: { runId: run },
  retries: retries(),
  timeout: testTimeoutMs(30_000, slowMo),
  expect: { timeout: 5_000 },
  // One set of baselines per pack and project, with no OS suffix: they are only ever rendered in
  // the pinned image of the visual lane (ADR 0009).
  snapshotPathTemplate: '{testDir}/visual/{projectName}/{testFilePath}/{arg}{ext}',
  reporter: isListing
    ? [['list']]
    : [
        ['list'],
        ['html', { open: 'never' }],
        // The results every test-management adapter reads (scripts/tm, ADR 0010).
        ['allure-playwright', { resultsDir: 'allure-results' }],
        ...extraReporters,
        // Last: once the others have written, remove the run's secrets from every artifact.
        ['./helpers/redact-reporter.ts'],
      ],
  use: {
    trace: traceMode(),
    screenshot: 'only-on-failure',
    ...(slowMo > 0 ? { launchOptions: { slowMo } } : {}),
  },
  projects: [
    // Unit tests of the core and the packs: part of `npm run gates`.
    {
      name: 'unit',
      testDir: '.',
      testMatch: '**/__tests__/**/*.spec.ts',
      testIgnore: notThisCheckout,
    },
    ...appPacks(__dirname).flatMap(packProjects),
  ],
});
