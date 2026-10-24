import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { REPO_ROOT } from '../config';
import {
  DEFAULT_DEVICES,
  DEVICE_PROJECTS,
  deviceUse,
  isDeviceName,
  type DeviceName,
} from '../devices';

const names = Object.keys(DEVICE_PROJECTS) as DeviceName[];

test('the catalog and the schema device enum list the same projects', () => {
  const schema = JSON.parse(
    readFileSync(join(REPO_ROOT, 'schemas', 'qa-config.schema.json'), 'utf8'),
  );
  expect([...schema.$defs.device.enum].sort()).toEqual([...names].sort());
});

test('every project resolves to a Playwright device whose shape matches its form factor', () => {
  for (const name of names) {
    const use = deviceUse(name);
    const { formFactor } = DEVICE_PROJECTS[name];
    expect(use.isMobile, name).toBe(formFactor !== 'desktop');
    expect(use.hasTouch, name).toBe(formFactor !== 'desktop');
    const landscape = use.viewport.width > use.viewport.height;
    if (name.endsWith('-landscape')) expect(landscape, name).toBe(true);
    else if (formFactor !== 'desktop') expect(landscape, name).toBe(false);
  }
});

test('the projects cover the three engines and the defaults are in the catalog', () => {
  const engines = new Set(names.map((name) => deviceUse(name).defaultBrowserType));
  expect([...engines].sort()).toEqual(['chromium', 'firefox', 'webkit']);
  expect(DEFAULT_DEVICES.every(isDeviceName)).toBe(true);
  expect(isDeviceName('desktop-chrome')).toBe(false);
  expect(isDeviceName('constructor')).toBe(false);
});
