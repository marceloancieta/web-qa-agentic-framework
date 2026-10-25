// qa-config for the tools in scripts/ (the test runner reads it through helpers/config.ts, with the
// same rules): qa-config.json when present, else the tracked example; QA_ENV picks the
// environment; QA_<PACK>_BASE_URL overrides one pack's base URL.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** `QA_JUICE_SHOP_BASE_URL` for `juice-shop`. */
export function packVariable(pack, setting) {
  return `QA_${pack.toUpperCase().replace(/-/g, '_')}_${setting}`;
}

/** The whole configuration file in effect: `{ source, config }`. */
export function readConfig(root) {
  const source = ['qa-config.json', 'qa-config.example.json'].find((file) =>
    existsSync(join(root, file)),
  );
  if (!source) throw new Error('No qa-config.json or qa-config.example.json found.');
  return { source, config: JSON.parse(readFileSync(join(root, source), 'utf8')) };
}

/** The active environment: `{ source, name, packs }`. */
export function activeEnvironment(root, env = process.env) {
  const source = ['qa-config.json', 'qa-config.example.json'].find((file) =>
    existsSync(join(root, file)),
  );
  if (!source) throw new Error('No qa-config.json or qa-config.example.json found.');
  const app = JSON.parse(readFileSync(join(root, source), 'utf8')).app ?? {};
  const name = env.QA_ENV || app.default_environment;
  const environment = app.environments?.[name];
  if (!environment) throw new Error(`${source}: environment "${name}" is not defined.`);
  return { source, name, packs: environment.packs ?? {} };
}

/** One pack's entry in the active environment, with its base URL after the override. */
export function packEntry(pack, root, env = process.env) {
  const { source, name, packs } = activeEnvironment(root, env);
  const entry = packs[pack];
  if (!entry) {
    throw new Error(
      `${source}: environment "${name}" has no entry for pack "${pack}" ` +
        `(app.environments.${name}.packs.${pack}). Configured packs: ${Object.keys(packs).join(', ') || '(none)'}.`,
    );
  }
  const baseUrl = (env[packVariable(pack, 'BASE_URL')] || entry.base_url).replace(/\/+$/, '');
  return { source, environment: name, entry, baseUrl };
}
