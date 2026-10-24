import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { runHook, tempProject } from './harness.mjs';

/** A qa-config whose `local` environment configures `packs` ({ name: baseUrl }). */
const configFor = (packs) => ({
  project: { name: 'probe-test' },
  app: {
    default_environment: 'local',
    environments: {
      local: {
        packs: Object.fromEntries(
          Object.entries(packs).map(([name, baseUrl]) => [name, { base_url: baseUrl }]),
        ),
      },
    },
  },
  test_management: { provider: 'local' },
});

function context(result) {
  assert.equal(result.code, 0);
  assert.equal(result.output.hookSpecificOutput.hookEventName, 'SessionStart');
  return result.output.hookSpecificOutput.additionalContext;
}

async function listening() {
  const server = createServer().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return server;
}

async function closedPort() {
  const server = await listening();
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('reports UP when the application port accepts connections', async () => {
  const server = await listening();
  try {
    const dir = tempProject({
      config: configFor({ saucedemo: `http://127.0.0.1:${server.address().port}/` }),
    });
    const text = context(await runHook('session-probe.mjs', {}, { projectDir: dir }));
    assert.match(text, /App \[local\] saucedemo \S+: UP/);
    assert.doesNotMatch(text, /qa-config\.json is missing/);
  } finally {
    server.close();
  }
});

test('reports DOWN with the docker hint naming the pack when a local application is not running', async () => {
  const port = await closedPort();
  const dir = tempProject({ config: configFor({ saucedemo: `http://localhost:${port}/` }) });
  const text = context(await runHook('session-probe.mjs', {}, { projectDir: dir }));
  assert.match(text, /App \[local\] saucedemo \S+: DOWN/);
  assert.match(text, /local application of saucedemo is not running/);
  assert.match(text, /docker compose up -d <service>/);
});

test('the hint names the npm script that starts the pack when package.json has one', async () => {
  const port = await closedPort();
  const dir = tempProject({
    config: configFor({ shop: `http://localhost:${port}/api` }),
    files: { 'package.json': JSON.stringify({ scripts: { 'shop:up': 'docker compose up -d' } }) },
  });
  const text = context(await runHook('session-probe.mjs', {}, { projectDir: dir }));
  assert.match(text, /local application of shop is not running\. Start it \(`npm run shop:up`\)/);
});

/** A project whose scripts/coverage-status.mjs runs `body` (the real script is not copied). */
function withCoverageScript(body) {
  const dir = tempProject({ config: configFor({ saucedemo: 'http://127.0.0.1:1/api' }) });
  mkdirSync(join(dir, 'scripts'));
  writeFileSync(join(dir, 'scripts', 'coverage-status.mjs'), body);
  return dir;
}

test('the coverage line sums the registries of coverage-status --json --report-only', async () => {
  const status = {
    packs: [
      { registries: [{ cases: 10, automated: 6, byStatus: { published: 4 } }] },
      { registries: [{ cases: 5, automated: 5, byStatus: { published: 0 } }] },
    ],
    findings: [{ rule: 'below-floor' }],
  };
  const dir = withCoverageScript(
    `if (!process.argv.includes('--json') || !process.argv.includes('--report-only')) process.exit(2);\n` +
      `console.log(${JSON.stringify(JSON.stringify(status))});\n`,
  );
  const text = context(await runHook('session-probe.mjs', {}, { projectDir: dir }));
  assert.match(
    text,
    /Coverage \(scripts\/coverage-status\.mjs\): 15 designed, 11 automated, 4 published in 2 registries; 1 finding\(s\)/,
  );
});

test('a coverage-status that fails is reported as unknown, never left out', async () => {
  const dir = withCoverageScript('process.exit(2);\n');
  const text = context(await runHook('session-probe.mjs', {}, { projectDir: dir }));
  assert.match(
    text,
    /Coverage \(scripts\/coverage-status\.mjs\): unknown \(coverage-status failed\)/,
  );
});

test('reports one line per pack of the environment', async () => {
  const server = await listening();
  try {
    const port = await closedPort();
    const dir = tempProject({
      config: configFor({
        saucedemo: `http://127.0.0.1:${server.address().port}/`,
        'juice-shop': `http://localhost:${port}/`,
      }),
    });
    const text = context(await runHook('session-probe.mjs', {}, { projectDir: dir }));
    assert.match(text, /App \[local\] saucedemo \S+: UP/);
    assert.match(text, /App \[local\] juice-shop \S+: DOWN/);
    assert.match(text, /local application of juice-shop is not running/);
    assert.doesNotMatch(text, /local application of saucedemo/);
  } finally {
    server.close();
  }
});

test('QA_<PACK>_BASE_URL overrides the base URL of that pack only', async () => {
  const dir = tempProject({
    config: configFor({ saucedemo: 'http://127.0.0.1:1/api', 'juice-shop': 'also not a url' }),
  });
  const text = context(
    await runHook(
      'session-probe.mjs',
      {},
      { projectDir: dir, env: { QA_SAUCEDEMO_BASE_URL: 'not a url' } },
    ),
  );
  assert.match(text, /App \[local\] saucedemo not a url: UNKNOWN \(base_url is not a valid URL\)/);
  assert.match(text, /App \[local\] juice-shop also not a url: UNKNOWN/);
});

test('hyphens in a pack name become underscores in its override variable', async () => {
  const dir = tempProject({ config: configFor({ 'juice-shop': 'http://127.0.0.1:1/' }) });
  const text = context(
    await runHook(
      'session-probe.mjs',
      {},
      { projectDir: dir, env: { QA_JUICE_SHOP_BASE_URL: 'not a url' } },
    ),
  );
  assert.match(text, /App \[local\] juice-shop not a url: UNKNOWN/);
});

test('QA_ENV selects the environment; one without packs is reported', async () => {
  const dir = tempProject({ config: configFor({ saucedemo: 'http://127.0.0.1:1/api' }) });
  const text = context(
    await runHook('session-probe.mjs', {}, { projectDir: dir, env: { QA_ENV: 'other' } }),
  );
  assert.match(text, /App \[other\]: UNKNOWN \(no packs configured for this environment\)/);
  assert.doesNotMatch(text, /saucedemo/);
});

test('missing config and dependencies are reported, never fatal', async () => {
  const dir = tempProject();
  const text = context(await runHook('session-probe.mjs', {}, { projectDir: dir }));
  assert.match(text, /no qa-config found/i);
  assert.match(text, /npm ci/);
  assert.match(text, /App \[no environment\]: UNKNOWN/);
});

/** An HTTP server answering every request with `status`. */
async function httpAnswering(status) {
  const { createServer: createHttpServer } = await import('node:http');
  const paths = [];
  const server = createHttpServer((request, response) => {
    paths.push(request.url);
    response.writeHead(status, { 'content-type': 'text/html' });
    response.end('<title>x</title>');
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return { server, paths, url: `http://127.0.0.1:${server.address().port}` };
}

test('the login page named in app.json is checked; the fragment never reaches the server', async () => {
  const app = await httpAnswering(200);
  try {
    const dir = tempProject({
      config: configFor({ shop: app.url }),
      files: { 'apps/shop/app.json': JSON.stringify({ name: 'shop', login_path: '/#/login' }) },
    });
    const text = context(await runHook('session-probe.mjs', {}, { projectDir: dir }));
    assert.match(text, /App \[local\] shop \S+: UP; login page \/#\/login: answers 200/);
    assert.doesNotMatch(text, /login page does not answer normally/);
    assert.deepEqual(app.paths, ['/']);
  } finally {
    app.server.close();
  }
});

test('a login page that fails is reported with a hint, and a pack without one is not checked', async () => {
  const app = await httpAnswering(503);
  try {
    const dir = tempProject({
      config: configFor({ shop: app.url, blog: app.url }),
      files: { 'apps/shop/app.json': JSON.stringify({ name: 'shop', login_path: '/login' }) },
    });
    const text = context(await runHook('session-probe.mjs', {}, { projectDir: dir }));
    assert.match(text, /shop \S+: UP; login page \/login: FAILS with 503/);
    assert.match(text, /Hint: shop is up but its login page does not answer normally/);
    assert.match(text, /blog \S+: UP$/m);
    assert.deepEqual(app.paths, ['/login']);
  } finally {
    app.server.close();
  }
});
