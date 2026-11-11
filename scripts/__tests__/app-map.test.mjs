import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  actorSession,
  mapFile,
  normalizePath,
  summarizeSnapshot,
  walk,
  walkStart,
} from '../app-map.mjs';
import { mapDrift } from '../lib/app-map-drift.mjs';
import { latestStatePath, readState, statePath } from '../lib/auth-state.mjs';

const PAGES = {
  '/': `<!doctype html><html lang="en"><head><title>Shop</title></head><body>
    <header><nav aria-label="Main"><a href="/products">Products</a> <a href="/signup">Sign up</a>
    <a href="/logout">Log out</a> <a href="https://elsewhere.example/">Partner</a></nav></header>
    <main><h1>Welcome</h1><button>Add to basket</button><button>Add to basket</button></main>
    <script>fetch('/api/products/42'); fetch('/api/visits', { method: 'POST' });</script></body></html>`,
  '/products': `<!doctype html><html lang="en"><head><title>Products</title></head><body>
    <main><h1>Products</h1><h2>Juices</h2><a href="/">Home</a></main></body></html>`,
  '/signup': `<!doctype html><html lang="en"><head><title>Sign up</title></head><body><main>
    <h1>Create an account</h1><form>
    <label for="email">Email</label><input id="email" type="email" required autocomplete="email">
    <label for="pw">Password</label><input id="pw" type="password" required minlength="8" maxlength="40">
    <input type="hidden" name="csrf" value="x"><button>Create</button></form></main></body></html>`,
  '/logout': '<!doctype html><title>Bye</title><p>Signed out</p>',
  '/session': `<!doctype html><html lang="en"><head><title>Session</title></head><body><main>
    <h1 id="seen"></h1><script>document.getElementById('seen').textContent =
    document.cookie + ' basket ' + sessionStorage.getItem('bid');</script></main></body></html>`,
};

async function serve() {
  const hits = [];
  const server = createServer((request, response) => {
    hits.push(`${request.method} ${request.url}`);
    const page = PAGES[request.url];
    if (page) {
      response.writeHead(200, { 'content-type': 'text/html' });
      return response.end(page);
    }
    response.writeHead(request.url.startsWith('/api/') ? 200 : 404, {
      'content-type': 'application/json',
    });
    response.end('{}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, hits, close: () => server.close() };
}

test('ids in paths become :id, and a snapshot is summarized with repeat counts', () => {
  assert.equal(normalizePath('/api/Products/42/reviews'), '/api/Products/:id/reviews');
  assert.equal(
    normalizePath('/api/orders/3f2a9c1b-4d5e-4f6a-8b9c-0d1e2f3a4b5c'),
    '/api/orders/:id',
  );
  const summary = summarizeSnapshot(
    [
      '- banner:',
      '  - navigation "Main":',
      '- main:',
      '  - heading "Shop" [level=1]',
      '  - button "Add"',
      '  - button "Add"',
      '  - link "Home":',
    ].join('\n'),
  );
  assert.deepEqual(summary, {
    landmarks: ['banner', 'main', 'navigation "Main"'],
    headings: ['h1 Shop'],
    interactive: ['button "Add" x2', 'link "Home"'],
  });
});

test('the signed-in account never reaches the map: its email becomes a placeholder', () => {
  const summary = summarizeSnapshot(
    [
      '- heading "Your Basket (customer-x1-w0@example.test)" [level=1]',
      '- button "Signed in as a.b+c@shop.example.org"',
    ].join('\n'),
  );
  assert.deepEqual(summary.headings, ['h1 Your Basket (<EMAIL>)']);
  assert.deepEqual(summary.interactive, ['button "Signed in as <EMAIL>"']);
});

test('an actor walk adds its routes and writes a map of its own', () => {
  const app = {
    app_map: { start: ['/', '/login'], actors: { customer: { start: ['/basket', '/'] } } },
  };
  assert.deepEqual(walkStart(app), ['/', '/login']);
  assert.deepEqual(walkStart(app, 'customer'), ['/', '/login', '/basket']);
  assert.deepEqual(walkStart(app, 'admin'), ['/', '/login']);
  assert.deepEqual(walkStart({}), ['/']);
  assert.equal(mapFile(), 'docs/app-map.json');
  assert.equal(mapFile('customer'), 'docs/app-map.customer.json');
});

test("an actor's newest state is found by role, and its session storage is split off", () => {
  const root = mkdtempSync(join(tmpdir(), 'auth-'));
  const authDir = join(root, 'states');
  assert.equal(latestStatePath(authDir, 'local', 'shop', 'customer'), null);
  const older = statePath(authDir, 'local', 'shop', 'customer', 0);
  const newer = statePath(authDir, 'local', 'shop', 'customer', 1);
  mkdirSync(dirname(older), { recursive: true });
  const session = [{ origin: 'http://shop.test', items: { bid: '7' } }];
  writeFileSync(older, JSON.stringify({ cookies: [], origins: [] }));
  writeFileSync(newer, JSON.stringify({ cookies: [], origins: [], sessionStorage: session }));
  writeFileSync(join(dirname(older), 'customer-admin-0.json'), '{}');
  utimesSync(older, new Date(1_000), new Date(1_000));
  assert.equal(latestStatePath(authDir, 'local', 'shop', 'customer'), newer);
  assert.deepEqual(readState(newer), {
    storageState: { cookies: [], origins: [] },
    sessionStorage: session,
  });
  assert.deepEqual(readState(older).sessionStorage, []);
  assert.throws(
    () => actorSession(root, 'local', 'shop', 'admin'),
    /no signed-in state for "admin" in environment "local" yet/,
  );
});

test('the walk maps every reachable route read-only, and never leaves the origin', async () => {
  const app = await serve();
  try {
    const map = await walk({ baseUrl: app.url, start: ['/'], exclude: ['^/logout$'] });
    assert.deepEqual(
      map.routes.map((entry) => entry.route),
      ['/', '/products', '/signup'],
    );
    const home = map.routes.find((entry) => entry.route === '/');
    assert.deepEqual(home.api_calls, ['GET /api/products/:id', 'POST /api/visits']);
    assert.deepEqual(map.blocked_writes, ['POST /api/visits']);
    assert.ok(!app.hits.includes('POST /api/visits'), 'the write reached the server');
    assert.ok(!app.hits.some((hit) => hit.includes('logout')), 'an excluded route was visited');
    assert.ok(home.interactive.includes('button "Add to basket" x2'));
    assert.ok(home.landmarks.includes('navigation "Main"'));
    const signup = map.routes.find((entry) => entry.route === '/signup');
    assert.deepEqual(signup.fields, [
      {
        tag: 'input',
        type: 'email',
        label: 'Email',
        constraints: { required: true, autocomplete: 'email' },
      },
      {
        tag: 'input',
        type: 'password',
        label: 'Password',
        constraints: { required: true, minlength: '8', maxlength: '40' },
      },
    ]);
    assert.deepEqual(mapDrift(map, map), []);
    // A second walk of the unchanged application is no drift.
    const again = await walk({ baseUrl: app.url, start: ['/'], exclude: ['^/logout$'] });
    assert.deepEqual(mapDrift(map, again), []);
  } finally {
    app.close();
  }
});

test('a session renewal the pack declares reaches the server; every other write stays blocked', async () => {
  const app = await serve();
  try {
    const map = await walk({ baseUrl: app.url, start: ['/'], sessionWrites: ['post /api/visits'] });
    assert.ok(app.hits.includes('POST /api/visits'), 'the declared write was blocked');
    assert.deepEqual(map.blocked_writes, []);
    const other = await walk({
      baseUrl: app.url,
      start: ['/'],
      sessionWrites: ['POST /api/other'],
    });
    assert.deepEqual(other.blocked_writes, ['POST /api/visits']);
  } finally {
    app.close();
  }
});

test("the walk carries the pack's cookies and the actor's session storage", async () => {
  const app = await serve();
  try {
    const map = await walk({
      baseUrl: app.url,
      start: ['/session'],
      cookies: { language: 'en' },
      sessionStorage: [{ origin: new URL(app.url).origin, items: { bid: '7' } }],
    });
    assert.deepEqual(map.routes[0].headings, ['h1 language=en basket 7']);
  } finally {
    app.close();
  }
});
