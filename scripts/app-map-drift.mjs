#!/usr/bin/env node
/**
 * App map drift: walks each pack of the active environment again, read-only, and compares the result
 * with its tracked `apps/<pack>/docs/app-map.json`, so a changed route, role, name or form constraint
 * is seen before a spec fails on it. What counts as drift, and what is left out, is
 * scripts/lib/app-map-drift.mjs.
 *
 *   node scripts/app-map-drift.mjs [--pack <pack>]... [--max-pages <n>] [--out <dir>]
 *
 * Without `--pack` it checks every pack of the environment QA_ENV names. The tracked maps are never
 * written: each live map goes to `<out>/<pack>.json` (default reports/app-map-drift/), beside
 * `summary.md`, so a reviewer can diff it against the tracked one and, if the change is expected,
 * rewrite the map in a design phase with `npm run app:map -- --pack <pack> --write`. The summary is
 * also appended to the file `$GITHUB_STEP_SUMMARY` names, when it is set.
 *
 * It maps anonymous visitors only: a signed-in map needs the browser state a spec run writes, and
 * `npm run app:map:check -- --pack <pack> --actor <role>` compares one with the same rules.
 *
 * Exit codes: 0 no drift; 1 drift, a pack that could not be mapped or has no tracked map; 2 usage.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { mapFile, mapPack } from './app-map.mjs';
import { driftLines, driftMarkdown, mapDrift } from './lib/app-map-drift.mjs';
import { REPO_ROOT } from './lib/cli.mjs';
import { activeEnvironment, packEntry } from './lib/qa-config.mjs';

/** The packs to check: those named, or every pack of the active environment. */
export function packsToCheck(named, environmentPacks) {
  const configured = Object.keys(environmentPacks);
  const unknown = named.filter((pack) => !configured.includes(pack));
  if (unknown.length > 0) {
    throw new Error(
      `the environment has no entry for ${unknown.join(', ')}; configured: ${configured.join(', ') || '(none)'}.`,
    );
  }
  return named.length > 0 ? [...new Set(named)] : configured;
}

/** Why a walk that reached its page limit may report routes as removed, or null. */
export function limitNote(routes, maxPages) {
  return routes >= maxPages
    ? `The walk stopped at --max-pages ${maxPages}: a tracked route past it shows as removed.`
    : null;
}

/** Check one pack: `{ pack, baseUrl, routes, changes, note }`, or `{ pack, baseUrl, error }`. */
async function checkPack({ root, pack, maxPages, out, environment }) {
  const tracked = join(root, 'apps', pack, mapFile());
  const { baseUrl } = packEntry(pack, root);
  if (!existsSync(tracked)) {
    return {
      pack,
      baseUrl,
      error: `no tracked map at apps/${pack}/${mapFile()}; write one with npm run app:map -- --pack ${pack} --write.`,
    };
  }
  let live;
  try {
    live = await mapPack({ root, pack, maxPages, log: (line) => console.error(line) });
  } catch (error) {
    // A refused connection or a page that never loads: name the system and what to check, once.
    return {
      pack,
      baseUrl,
      error:
        `${error.message.split('\n')[0]} Check that the application answers, QA_ENV ` +
        `("${environment.name}") and app.environments.${environment.name}.packs.${pack} in qa-config.`,
    };
  }
  writeFileSync(join(out, `${pack}.json`), `${JSON.stringify(live.map, null, 2)}\n`);
  const changes = mapDrift(JSON.parse(readFileSync(tracked, 'utf8')), live.map);
  const routes = live.map.routes.length;
  return { pack, baseUrl: live.baseUrl, routes, changes, note: limitNote(routes, maxPages) };
}

async function main() {
  let values;
  let environment;
  let packs;
  try {
    ({ values } = parseArgs({
      options: {
        pack: { type: 'string', multiple: true, default: [] },
        'max-pages': { type: 'string', default: '25' },
        out: { type: 'string', default: join('reports', 'app-map-drift') },
      },
    }));
    if (!/^[1-9]\d*$/.test(values['max-pages'])) throw new Error('--max-pages must be a number.');
    environment = activeEnvironment(REPO_ROOT);
    packs = packsToCheck(values.pack, environment.packs);
    if (packs.length === 0) throw new Error(`environment "${environment.name}" has no packs.`);
  } catch (error) {
    console.error(`app-drift: ${error.message}`);
    process.exit(2);
  }
  const maxPages = Number(values['max-pages']);
  const out = resolve(REPO_ROOT, values.out);
  mkdirSync(out, { recursive: true });
  const results = [];
  for (const pack of packs) {
    results.push(await checkPack({ root: REPO_ROOT, pack, maxPages, out, environment }));
  }
  for (const result of results) {
    if (result.error)
      console.error(`app-drift: ${result.pack} could not be mapped: ${result.error}`);
    else if (result.changes.length === 0) {
      const routes = `${result.routes} route${result.routes === 1 ? '' : 's'}`;
      console.log(`app-drift: ${result.pack} matches its tracked map (${routes}).`);
    } else {
      console.error(`app-drift: ${result.pack} drifted from its tracked map:`);
      for (const line of driftLines(result.changes)) console.error(line);
    }
    if (result.note) console.error(`app-drift: ${result.note}`);
  }
  const summary = [
    `## App map drift (${environment.name})`,
    '',
    ...results.map(driftMarkdown),
    `Live maps: \`${values.out.replace(/\\/g, '/')}/<pack>.json\`.`,
    '',
  ].join('\n');
  writeFileSync(join(out, 'summary.md'), summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  const failed = results.some((result) => result.error || result.changes.length > 0);
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`app-drift: ${error.message}`);
    process.exit(1);
  });
}
