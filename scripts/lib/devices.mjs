// The device projects as the scripts see them: the catalog helpers/device-projects.json (which
// helpers/devices.ts types for the specs), with each project's browser engine taken from the
// Playwright device it uses, so the two never disagree.
//
// The helpers load this module through Playwright's transform, where `import.meta` does not exist,
// so the repository root is a parameter instead of scripts/lib/cli.mjs's REPO_ROOT.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { devices } from '@playwright/test';

const readCatalog = (root) =>
  JSON.parse(readFileSync(join(root, 'helpers', 'device-projects.json'), 'utf8'));

/** Every device project under `root`: `[{ name, browser, formFactor }]`, in catalog order. */
export function deviceProjects(root) {
  return Object.entries(readCatalog(root).projects).map(([name, { descriptor, formFactor }]) => {
    const device = devices[descriptor];
    if (!device) throw new Error(`Playwright has no device "${descriptor}" for project "${name}".`);
    return { name, browser: device.defaultBrowserType, formFactor };
  });
}

/** The projects an environment runs when qa-config does not list them. */
export const defaultProjects = (root) => readCatalog(root).default;
