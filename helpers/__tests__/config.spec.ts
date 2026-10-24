import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  actorConfig,
  configuredPacks,
  loadRuntime,
  loadSettings,
  missingEnvVars,
  packVariable,
  projectPack,
  requiredEnvVars,
} from '../config';

/** A throwaway root with this qa-config.json. */
function rootWith(config: object): string {
  const root = mkdtempSync(join(tmpdir(), 'qa-config-'));
  writeFileSync(join(root, 'qa-config.json'), JSON.stringify(config));
  return root;
}

const shop = {
  base_url: 'http://localhost:3000/',
  allow_writes: true,
  actors: {
    customer: { account: 'provisioned' },
    admin: {
      account: 'existing',
      username_env: 'SHOP_ADMIN_USER',
      password_env: 'SHOP_ADMIN_PASSWORD',
    },
  },
};
const config = {
  app: {
    default_environment: 'local',
    environments: {
      local: { packs: { shop } },
      ci: {
        projects: ['desktop-webkit', 'tablet'],
        packs: { shop: { ...shop, default_actor: 'admin' } },
      },
    },
  },
  test_management: { provider: 'local' },
};

test('the default environment, its default devices and accessibility tags', () => {
  const settings = loadSettings({}, rootWith(config));
  expect(settings.source).toBe('qa-config.json');
  expect(settings.environment).toBe('local');
  expect(settings.devices).toEqual(['desktop-chromium', 'mobile-chrome']);
  expect(settings.accessibilityTags).toEqual(['wcag2a', 'wcag2aa', 'wcag21aa']);
});

test('QA_ENV picks another environment with its own devices', () => {
  const settings = loadSettings({ QA_ENV: 'ci' }, rootWith(config));
  expect(settings.environment).toBe('ci');
  expect(settings.devices).toEqual(['desktop-webkit', 'tablet']);
});

test('an unknown environment or device is an error that lists what exists', () => {
  const root = rootWith(config);
  expect(() => loadSettings({ QA_ENV: 'staging' }, root)).toThrow(
    /"staging" is not defined\. Known: local, ci/,
  );
  const odd = rootWith({
    app: {
      default_environment: 'x',
      environments: { x: { projects: ['desktop-chrome'], packs: {} } },
    },
  });
  expect(() => loadSettings({}, odd)).toThrow(/unknown projects: desktop-chrome/);
});

test('a pack: base URL without trailing slash, the override variable, the default actor', () => {
  const root = rootWith(config);
  const local = loadRuntime('shop', {}, root);
  expect(local.baseUrl).toBe('http://localhost:3000');
  expect(local.allowWrites).toBe(true);
  expect(local.defaultActor).toBe('customer');
  expect(loadRuntime('shop', { QA_ENV: 'ci' }, root).defaultActor).toBe('admin');
  expect(packVariable('juice-shop', 'BASE_URL')).toBe('QA_JUICE_SHOP_BASE_URL');
  expect(loadRuntime('shop', { QA_SHOP_BASE_URL: 'http://shop.test//' }, root).baseUrl).toBe(
    'http://shop.test',
  );
});

test('a pack the environment does not configure is an error naming the configured ones', () => {
  const root = rootWith(config);
  expect(configuredPacks({}, root)).toEqual(['shop']);
  expect(() => loadRuntime('blog', {}, root)).toThrow(
    /environment "local" has no entry for pack "blog" \(app\.environments\.local\.packs\.blog\)\. Configured packs: shop\./,
  );
});

test('actors: anonymous is built in, unknown names are listed, and only existing accounts need variables', () => {
  const qa = loadRuntime('shop', {}, rootWith(config));
  expect(actorConfig(qa, 'anonymous')).toBeNull();
  expect(() => actorConfig(qa, 'guest')).toThrow(/Known: anonymous, customer, admin/);
  expect(requiredEnvVars(actorConfig(qa, 'customer'))).toEqual([]);
  expect(requiredEnvVars(actorConfig(qa, 'admin'))).toEqual([
    'SHOP_ADMIN_USER',
    'SHOP_ADMIN_PASSWORD',
  ]);
  expect(requiredEnvVars(null)).toEqual([]);
  expect(missingEnvVars(['A', 'B', 'C'], { A: 'x', B: '  ' })).toEqual(['B', 'C']);
});

test('the example config is used when there is no qa-config.json', () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-config-'));
  writeFileSync(join(root, 'qa-config.example.json'), JSON.stringify(config));
  expect(loadSettings({}, root).source).toBe('qa-config.example.json');
  expect(() => loadSettings({}, mkdtempSync(join(tmpdir(), 'qa-config-')))).toThrow(
    /Copy the example/,
  );
});

test('projectPack reads the project metadata and explains a project without a pack', () => {
  expect(projectPack({ name: 'shop-tablet', metadata: { pack: 'shop' } })).toBe('shop');
  expect(() => projectPack({ name: 'unit', metadata: {} })).toThrow(
    /Project "unit" has no app pack/,
  );
});
