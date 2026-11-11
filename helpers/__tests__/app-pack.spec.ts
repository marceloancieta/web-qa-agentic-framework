import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { appPacks, contextCookies, loadAppPack, manifestProblems } from '../app-pack';

/** A throwaway root with `apps/<name>/app.json` for each entry (null: a folder without one). */
function rootWith(packs: Record<string, object | null>): string {
  const root = mkdtempSync(join(tmpdir(), 'app-pack-'));
  for (const [name, manifest] of Object.entries(packs)) {
    mkdirSync(join(root, 'apps', name), { recursive: true });
    if (manifest) writeFileSync(join(root, 'apps', name, 'app.json'), JSON.stringify(manifest));
  }
  return root;
}

const valid = {
  name: 'shop',
  version: '17.1.1',
  title: 'Shop',
  testIdAttribute: 'data-test',
  breakpoints: { md: 768, lg: 1024 },
  third_party_hosts: ['fonts.example.com', 'cdn.example.com:443'],
  workers: 2,
};

test('packs are the folders under apps/ with an app.json, sorted', () => {
  expect(
    appPacks(rootWith({ shop: valid, blog: { ...valid, name: 'blog' }, notes: null })),
  ).toEqual(['blog', 'shop']);
  expect(appPacks(mkdtempSync(join(tmpdir(), 'app-pack-')))).toEqual([]);
});

test('a valid manifest loads with its directory', () => {
  const root = rootWith({ shop: valid });
  const pack = loadAppPack(join(root, 'apps', 'shop'));
  expect(pack.testIdAttribute).toBe('data-test');
  expect(pack.dir).toBe(join(root, 'apps', 'shop'));
});

test('every problem of a manifest is reported at once', () => {
  const problems = manifestProblems(
    {
      name: 'Shop',
      version: '',
      testIdAttribute: '[data-test]',
      breakpoints: { md: 0 },
      third_party_hosts: ['https://fonts.example.com/css'],
      workers: 1.5,
    },
    'shop',
  );
  expect(problems).toEqual([
    'name must match ^[a-z][a-z0-9-]*$',
    'version must match ^[a-z0-9][a-z0-9.-]*$ (it is part of every case identity)',
    'title is required',
    'testIdAttribute must be an attribute name such as data-test',
    'breakpoints.md must be a width in pixels',
    'third_party_hosts has "https://fonts.example.com/css", which is not a host name',
    'workers must be a whole number of at least 1',
  ]);
});

test('the manifest name must equal its folder, and loading names the file', () => {
  expect(manifestProblems(valid, 'store')).toEqual([
    'name "shop" must equal the folder name "store"',
  ]);
  const root = rootWith({ store: valid });
  expect(() => loadAppPack(join(root, 'apps', 'store'))).toThrow(
    /app\.json: name "shop" must equal the folder name "store"\./,
  );
});

test('pack cookies: plain names and values, never a session; actor routes start with /', () => {
  expect(
    manifestProblems(
      {
        ...valid,
        cookies: { language: 'en', session_id: 'x', 'bad name': 'y', banner: 'a b' },
        app_map: { actors: { customer: { start: ['/basket', 'orders'] }, Admin: {} } },
      },
      'shop',
    ),
  ).toEqual([
    'cookies.session_id looks like a session; sessions come from the actors',
    'cookies has "bad name", which is not a cookie name',
    'cookies.banner must be a value without spaces or semicolons',
    'app_map.actors has "Admin", which is not a role name',
    'app_map.actors.customer.start has "orders", which does not start with /',
  ]);
  expect(contextCookies({ cookies: { language: 'en' } }, 'http://shop.test')).toEqual([
    { name: 'language', value: 'en', url: 'http://shop.test' },
  ]);
  expect(contextCookies({}, 'http://shop.test')).toEqual([]);
});

test('the app map lets through only writes that name the session', () => {
  const problems = (session_writes: string[]) =>
    manifestProblems({ ...valid, app_map: { session_writes } }, 'shop');
  expect(
    problems(['POST /api/v3/admin/auth/refresh', 'put /session', 'PATCH /oauth/token']),
  ).toEqual([]);
  const bad = [
    'POST /api/orders',
    'DELETE /auth/session',
    'GET /auth/refresh',
    'POST auth/refresh',
  ];
  expect(problems(bad)).toEqual(
    bad.map(
      (write) =>
        `app_map.session_writes has "${write}", which is not "POST|PUT|PATCH /path" naming the session (auth, session, token, refresh, login)`,
    ),
  );
});
