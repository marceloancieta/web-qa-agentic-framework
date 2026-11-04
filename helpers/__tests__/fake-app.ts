// A small web application for the core's unit tests, served on 127.0.0.1 by a worker fixture.
// Accounts live in memory and sign in through a REST API that returns a token, which the page
// keeps in local storage: the same shape as the applications the packs test.
//
//   /           who is signed in ("Signed in as <name>" or "Signed out")
//   /products   a list loaded from /api/products, with a loading indicator and error states, and a
//               script from a third-party host
//   /broken     a console error, an uncaught exception, a broken image and a 500 response
//   /headers    a page with every security header and a well-made cookie; `?omit=<header>` leaves
//               one header out, the seeded gap of the security headers check
//   /api/cookie sets a cookie without attributes, from a fetch
//   /api/users  POST creates an account; DELETE /api/users/<name> removes it (needs the token)
//   /api/login  POST returns { token }; /api/me answers the account of the bearer token

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { test as base } from '@playwright/test';

export const THIRD_PARTY_HOST = '127.0.0.2:9';

const HOME = `<!doctype html><html lang="en"><head><title>Account</title></head><body><main>
<h1>Account</h1><p id="status">Checking</p></main><script>
const token = localStorage.getItem('token');
const status = document.getElementById('status');
if (!token) status.textContent = 'Signed out';
else fetch('/api/me', { headers: { authorization: 'Bearer ' + token } })
  .then((r) => (r.ok ? r.json() : null))
  .then((me) => { status.textContent = me ? 'Signed in as ' + me.username : 'Signed out'; });
</script></body></html>`;

const PRODUCTS = `<!doctype html><html lang="en"><head><title>Products</title>
<script src="http://${THIRD_PARTY_HOST}/tag.js"></script></head><body><main><h1>Products</h1>
<p role="status" id="loading">Loading products</p><ul id="list"></ul><p id="message"></p></main><script>
fetch('/api/products')
  .then((r) => { if (!r.ok) throw new Error('status ' + r.status); return r.json(); })
  .then((items) => {
    document.getElementById('message').textContent = items.length ? '' : 'No products';
    for (const item of items) {
      const li = document.createElement('li'); li.textContent = item.name;
      document.getElementById('list').append(li);
    }
  })
  .catch(() => { document.getElementById('message').textContent = 'Could not load products'; })
  .finally(() => document.getElementById('loading').remove());
</script></body></html>`;

const BROKEN = `<!doctype html><html lang="en"><head><title>Broken</title></head><body><main>
<h1>Broken</h1><img src="/missing.png" alt="Missing picture"></main><script>
console.error('boom in the console');
setTimeout(() => { throw new Error('uncaught boom'); }, 0);
fetch('/api/fail');
</script></body></html>`;

const HEADERS_PAGE = `<!doctype html><html lang="en"><head><title>Headers</title></head><body><main>
<h1>Headers</h1></main></body></html>`;

/** What a page that keeps every rule of the security headers check sends. */
export const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=()',
  'set-cookie': 'session=fake; Path=/; HttpOnly; SameSite=Lax',
};

function readBody(request: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => resolve(raw ? (JSON.parse(raw) as Record<string, string>) : {}));
  });
}

export interface FakeApp {
  url: string;
  /** Accounts that exist now, by user name. */
  accounts: Map<string, string>;
  /** Paths the server answered, in order. */
  hits: string[];
}

export async function startFakeApp(): Promise<FakeApp & { close(): Promise<void> }> {
  const accounts = new Map<string, string>();
  const tokens = new Map<string, string>();
  const hits: string[] = [];
  const send = (
    response: ServerResponse,
    status: number,
    body: unknown,
    type = 'application/json',
  ) => {
    response.writeHead(status, { 'content-type': type });
    response.end(type === 'application/json' ? JSON.stringify(body) : String(body));
  };
  const userOf = (request: IncomingMessage) =>
    tokens.get((request.headers.authorization ?? '').replace(/^Bearer /, ''));

  const server = createServer(async (request, response) => {
    const address = new URL(request.url ?? '/', 'http://x');
    const path = address.pathname;
    hits.push(`${request.method} ${path}`);
    if (path === '/') return send(response, 200, HOME, 'text/html');
    if (path === '/headers') {
      const omit = address.searchParams.get('omit');
      for (const [name, value] of Object.entries(SECURITY_HEADERS))
        if (name !== omit) response.setHeader(name, value);
      return send(response, 200, HEADERS_PAGE, 'text/html');
    }
    if (path === '/api/cookie') {
      response.setHeader('set-cookie', 'tracker=fake');
      return send(response, 200, { ok: true });
    }
    if (path === '/products') return send(response, 200, PRODUCTS, 'text/html');
    if (path === '/broken') return send(response, 200, BROKEN, 'text/html');
    if (path === '/api/products')
      return send(response, 200, [{ name: 'Apple juice' }, { name: 'Lemon tart' }]);
    if (path === '/api/fail') return send(response, 500, { error: 'failed on purpose' });
    if (path === '/api/users' && request.method === 'POST') {
      const { username, password } = await readBody(request);
      if (!username || !password || accounts.has(username))
        return send(response, 400, { error: 'invalid' });
      accounts.set(username, password);
      return send(response, 201, { username });
    }
    if (path === '/api/login' && request.method === 'POST') {
      const { username, password } = await readBody(request);
      if (!username || accounts.get(username) !== password)
        return send(response, 401, { error: 'invalid' });
      const token = randomBytes(16).toString('hex');
      tokens.set(token, username);
      return send(response, 200, { token });
    }
    if (path === '/api/me') {
      const user = userOf(request);
      return user
        ? send(response, 200, { username: user })
        : send(response, 401, { error: 'no session' });
    }
    if (path.startsWith('/api/users/') && request.method === 'DELETE') {
      const name = decodeURIComponent(path.slice('/api/users/'.length));
      if (userOf(request) !== name) return send(response, 403, { error: 'not yours' });
      accounts.delete(name);
      return send(response, 204, '', 'text/plain');
    }
    return send(response, 404, 'not found', 'text/plain');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    accounts,
    hits,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** Playwright's test with the fake application started once per worker. */
export const test = base.extend<object, { fakeApp: FakeApp }>({
  fakeApp: [
    async ({}, use) => {
      const app = await startFakeApp();
      await use(app);
      await app.close();
    },
    { scope: 'worker' },
  ],
});

export { expect } from '@playwright/test';
