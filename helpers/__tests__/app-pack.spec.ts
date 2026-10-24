import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { appPacks, loadAppPack, manifestProblems } from '../app-pack';

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
