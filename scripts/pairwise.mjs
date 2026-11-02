#!/usr/bin/env node
/**
 * `npm run pairwise`: the runs that cover every pair of browser, form factor and role for each pack
 * an environment serves, instead of every project with every role (scripts/lib/run-matrix.mjs).
 * The projects are the environment's; an environment marked `pairwise: true` is checked by
 * config:check to realize every browser × form factor pair of the device catalog, so its runs
 * stand for the whole catalog.
 *
 *   node scripts/pairwise.mjs [--env <name>] [--json]
 *
 * The environment defaults to QA_ENV, then qa-config `app.default_environment`. Each pack's roles
 * are `anonymous` and the actors its entry names. Exit codes: 0 printed; 1 the environment is
 * marked pairwise and its projects miss a pair, or the configuration cannot be read; 2 usage error.
 */

import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './lib/cli.mjs';
import { defaultProjects, deviceProjects } from './lib/devices.mjs';
import { readConfig } from './lib/qa-config.mjs';
import { ANONYMOUS_ROLE, fullRunCount, projectGaps, runSet } from './lib/run-matrix.mjs';

/** The roles of a pack's entry: anonymous first, then its actors. */
export const packRoles = (entry) => [
  ANONYMOUS_ROLE,
  ...Object.keys(entry?.actors ?? {}).filter((name) => name !== ANONYMOUS_ROLE),
];

/**
 * The runs of an environment: `{ name, pairwise, gaps, packs: [{ pack, roles, runs, full }] }`,
 * with `gaps` the browser × form factor pairs its projects miss.
 */
export function environmentRuns(config, name, catalog = deviceProjects(), root = REPO_ROOT) {
  const environment = config.app?.environments?.[name];
  if (!environment) throw new Error(`environment "${name}" is not defined in qa-config.`);
  const names = environment.projects ?? defaultProjects(root);
  const projects = names.map((project) => catalog.find((p) => p.name === project));
  return {
    name,
    pairwise: environment.pairwise === true,
    gaps: projectGaps(names, catalog),
    packs: Object.entries(environment.packs ?? {}).map(([pack, entry]) => {
      const roles = packRoles(entry);
      return { pack, roles, runs: runSet(projects, roles), full: fullRunCount(projects, roles) };
    }),
  };
}

function print(result) {
  console.log(
    `pairwise: environment ${result.name}${result.pairwise ? ' (pairwise)' : ''}` +
      (result.gaps.length ? `; its projects miss ${result.gaps.join(', ')}` : ''),
  );
  for (const { pack, roles, runs, full } of result.packs) {
    console.log(`\n${pack}: ${runs.length} runs instead of ${full} (roles: ${roles.join(', ')})`);
    const byProject = new Map();
    for (const run of runs)
      byProject.set(run.project, [...(byProject.get(run.project) ?? []), run.role]);
    for (const [project, projectRoles] of byProject)
      console.log(`  ${project.padEnd(24)} ${projectRoles.join(', ')}`);
  }
}

function main() {
  let values;
  try {
    ({ values } = parseArgs({
      options: { env: { type: 'string' }, json: { type: 'boolean', default: false } },
    }));
  } catch (error) {
    console.error(`pairwise: ${error.message}`);
    process.exit(2);
  }
  const { config } = readConfig(REPO_ROOT);
  const name = values.env ?? (process.env.QA_ENV || config.app?.default_environment);
  const result = environmentRuns(config, name);
  if (values.json) console.log(JSON.stringify(result, null, 2));
  else print(result);
  process.exitCode = result.pairwise && result.gaps.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(`pairwise: ${error.message}`);
    process.exitCode = 1;
  }
}
