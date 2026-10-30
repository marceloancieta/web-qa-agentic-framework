// The device projects every pack can run on. qa-config picks which of them an environment runs
// (`app.environments.<env>.projects`); this catalog says what each one is. The names are the
// schema's `device` enum, and a unit test keeps the two equal.

import { devices } from '@playwright/test';

export type FormFactor = 'desktop' | 'tablet' | 'mobile';

export interface DeviceProject {
  /** Playwright's device descriptor that the project uses. */
  descriptor: string;
  /**
   * Desktop projects leave out `@mobile-only` cases; tablet and mobile leave out `@desktop-only`.
   * The engine comes from the descriptor: WebKit projects also leave out `@not-webkit`.
   */
  formFactor: FormFactor;
}

export const DEVICE_PROJECTS = {
  'desktop-chromium': { descriptor: 'Desktop Chrome', formFactor: 'desktop' },
  'desktop-firefox': { descriptor: 'Desktop Firefox', formFactor: 'desktop' },
  'desktop-webkit': { descriptor: 'Desktop Safari', formFactor: 'desktop' },
  tablet: { descriptor: 'iPad (gen 7)', formFactor: 'tablet' },
  'tablet-landscape': { descriptor: 'iPad (gen 7) landscape', formFactor: 'tablet' },
  'mobile-chrome': { descriptor: 'Pixel 7', formFactor: 'mobile' },
  'mobile-chrome-landscape': { descriptor: 'Pixel 7 landscape', formFactor: 'mobile' },
  'mobile-safari': { descriptor: 'iPhone 14', formFactor: 'mobile' },
  'mobile-safari-landscape': { descriptor: 'iPhone 14 landscape', formFactor: 'mobile' },
} as const satisfies Record<string, DeviceProject>;

export type DeviceName = keyof typeof DEVICE_PROJECTS;

/** What an environment runs when qa-config does not list its projects. */
export const DEFAULT_DEVICES: DeviceName[] = ['desktop-chromium', 'mobile-chrome'];

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
