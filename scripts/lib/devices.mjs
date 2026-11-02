// The device projects as the scripts see them: the catalog helpers/device-projects.json (which
// helpers/devices.ts types for the specs), with each project's browser engine taken from the
// Playwright device it uses, so the two never disagree.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { devices } from '@playwright/test';
import { REPO_ROOT } from './cli.mjs';

const readCatalog = (root) =>
  JSON.parse(readFileSync(join(root, 'helpers', 'device-projects.json'), 'utf8'));

/** Every device project: `[{ name, browser, formFactor }]`, in catalog order. */
export function deviceProjects(root = REPO_ROOT) {
  return Object.entries(readCatalog(root).projects).map(([name, { descriptor, formFactor }]) => {
    const device = devices[descriptor];
    if (!device) throw new Error(`Playwright has no device "${descriptor}" for project "${name}".`);
    return { name, browser: device.defaultBrowserType, formFactor };
  });
}

/** The projects an environment runs when qa-config does not list them. */
export const defaultProjects = (root = REPO_ROOT) => readCatalog(root).default;
