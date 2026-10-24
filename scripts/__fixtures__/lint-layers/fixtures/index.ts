import { test as base } from '@playwright/test';
import { loadRuntime } from '../helpers/config';
import * as packs from '../apps'; // expect-finding: core-imports-pack

// The core reads a pack by path at run time, which is allowed.
const packDir = (name: string) => `apps/${name}`;

export const test = base.extend({});
export { loadRuntime, packDir, packs };
