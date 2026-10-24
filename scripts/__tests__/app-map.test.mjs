import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { drift, normalizePath, summarizeSnapshot, walk } from '../app-map.mjs';

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
    assert.deepEqual(drift(map, map), []);
  } finally {
    app.close();
  }
});

test('drift names added, changed and removed routes', () => {
  const tracked = {
    routes: [
      { route: '/a', title: 'A' },
      { route: '/b', title: 'B' },
    ],
  };
  const live = {
    routes: [
      { route: '/a', title: 'A2' },
      { route: '/c', title: 'C' },
    ],
  };
  assert.deepEqual(drift(tracked, live), ['changed  /a', 'removed  /b', 'added    /c']);
});
