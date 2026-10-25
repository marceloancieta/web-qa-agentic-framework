#!/usr/bin/env node
/**
 * Coverage status: what the registries hold and how far each case has come. Per registry, the cases
 * by status, how many are automated (automated or published), and for each quality dimension that
 * applies, how many cases carry its tag. The suite linter's findings are listed after the table.
 *
 *   node scripts/coverage-status.mjs                  the table; exit 1 when there are findings
 *   node scripts/coverage-status.mjs --json           the same as JSON
 *   node scripts/coverage-status.mjs --report-only    exit 0 whatever the findings (session probe)
 *   node scripts/coverage-status.mjs --root <dir>     another tree
 */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './lib/cli.mjs';
import { applyingDimensions, loadRegistries, STATUSES } from './lib/registry.mjs';
import { DIMENSIONS } from './lib/tags.mjs';
import { lintSuite } from './lint-suite.mjs';

/** The status of every pack's registries, and the suite findings. */
export function coverageStatus(root = REPO_ROOT) {
  const packs = new Map();
  for (const registry of loadRegistries(root)) {
    const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0]));
    for (const row of registry.cases) if (row.status in byStatus) byStatus[row.status] += 1;
    const dimensions = Object.fromEntries(
      applyingDimensions(registry).map((name) => [
        name,
        registry.cases.filter((row) => row.tagList.includes(DIMENSIONS[name])).length,
      ]),
    );
    const entry = {
      file: registry.file,
      feature: registry.meta.feature ?? null,
      cases: registry.cases.length,
      automated: byStatus.automated + byStatus.published,
      byStatus,
      dimensions,
    };
    packs.set(registry.pack, [...(packs.get(registry.pack) ?? []), entry]);
  }
  return {
    packs: [...packs].map(([pack, registries]) => ({ pack, registries })),
    findings: lintSuite(root),
  };
}

function table(status) {
  const lines = [
    '| Registry | Cases | Automated | draft | approved | automated | published | blocked | Dimensions |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const { registries } of status.packs) {
    for (const r of registries) {
      const dims = Object.entries(r.dimensions)
        .map(([name, count]) => `${name} ${count}`)
        .join(', ');
      lines.push(
        `| ${r.file} | ${r.cases} | ${r.automated} | ${STATUSES.map((s) => r.byStatus[s]).join(' | ')} | ${dims || '-'} |`,
      );
    }
  }
  return lines.join('\n');
}

function main() {
  const { values } = parseArgs({
    options: {
      json: { type: 'boolean', default: false },
      'report-only': { type: 'boolean', default: false },
      root: { type: 'string' },
    },
  });
  const status = coverageStatus(resolve(values.root ?? REPO_ROOT));
  if (values.json) console.log(JSON.stringify(status, null, 2));
  else {
    console.log(status.packs.length === 0 ? 'coverage-status: no registries yet.' : table(status));
    for (const f of status.findings) console.log(`${f.file}:${f.line}  ${f.rule}  ${f.message}`);
  }
  process.exitCode = status.findings.length > 0 && !values['report-only'] ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
