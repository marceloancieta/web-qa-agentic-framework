import { SearchClient } from '../apps/demo/api/search-client'; // expect-finding: core-imports-pack
export { HomePage } from '../apps/demo/pages/home-page'; // expect-finding: core-imports-pack
import { redact } from './redact';
import { devices } from '@playwright/test';
import { appsLike } from './apps-like';

export async function loadCatalog() {
  const mocks = await import('../apps/demo/mocks/catalog'); // expect-finding: core-imports-pack
  const manifest = require('../apps/demo/app.json'); // expect-finding: core-imports-pack
  const computed = await import(`../apps/${process.env.PACK}/mocks/catalog`);
  return { mocks, manifest, computed, redact, devices, appsLike, SearchClient };
}
