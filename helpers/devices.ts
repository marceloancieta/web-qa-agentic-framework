// The device projects every pack can run on. qa-config picks which of them an environment runs
// (`app.environments.<env>.projects`); the catalog, device-projects.json, says what each one is,
// as data the scripts read too (scripts/lib/devices.mjs). The names are the schema's `device`
// enum, and a unit test keeps the two equal.

import { devices } from '@playwright/test';
import catalog from './device-projects.json';

export const FORM_FACTORS = ['desktop', 'tablet', 'mobile'] as const;
export type FormFactor = (typeof FORM_FACTORS)[number];

export interface DeviceProject {
  /** Playwright's device descriptor that the project uses. */
  descriptor: string;
  /**
   * Desktop projects leave out `@mobile-only` cases; tablet and mobile leave out `@desktop-only`.
   * The engine comes from the descriptor: WebKit projects also leave out `@not-webkit`.
   */
  formFactor: FormFactor;
}

export type DeviceName = keyof typeof catalog.projects;

/** The catalog, typed: a unit test checks that each form factor is one of FORM_FACTORS. */
export const DEVICE_PROJECTS: Readonly<Record<DeviceName, DeviceProject>> =
  catalog.projects as Record<DeviceName, DeviceProject>;

/**
 * What an environment runs when qa-config does not list its projects; a unit test checks that
 * each one is in the catalog.
 */
export const DEFAULT_DEVICES = catalog.default as DeviceName[];

export function isDeviceName(name: string): name is DeviceName {
  return Object.hasOwn(DEVICE_PROJECTS, name);
}

/** Playwright's settings for a device project (viewport, user agent, touch, browser). */
export function deviceUse(name: DeviceName) {
  const descriptor = devices[DEVICE_PROJECTS[name].descriptor];
  if (!descriptor) {
    throw new Error(
      `Playwright has no device "${DEVICE_PROJECTS[name].descriptor}" for project "${name}"; ` +
        'update helpers/devices.ts for this Playwright version.',
    );
  }
  return descriptor;
}
