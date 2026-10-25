#!/usr/bin/env node
/**
 * Traceability: every requirement a registry declares, and the cases that cover it.
 *
 *   uncovered-requirement   no case names the requirement.
 *   mocked-only             every case that names it carries @mocked: a mock proves how the UI
 *                           handles an answer, not that the application gives it, so a requirement
 *                           about the integration needs at least one case against the real system.
 *
 *   node scripts/traceability.mjs [--root <dir>]   the table and the findings; exit 1 on findings
 */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './lib/cli.mjs';
import { finding } from './lib/lint.mjs';
import { loadRegistries } from './lib/registry.mjs';
import { MOCKED_TAG } from './lib/tags.mjs';

/** Rows `{ file, requirement, cases }` and the findings. */
export function traceability(root = REPO_ROOT) {
  const rows = [];
  const findings = [];
  for (const registry of loadRegistries(root)) {
    const line = registry.keyLines?.get('requirements') ?? 1;
    for (const requirement of registry.requirements) {
      const cases = registry.cases.filter((row) => row.requirement === requirement?.id);
      rows.push({
        file: registry.file,
        requirement: requirement?.id,
        cases: cases.map((row) => row.id),
      });
      if (cases.length === 0) {
        findings.push(
          finding('uncovered-requirement', registry.file, line, `${requirement?.id} has no case`),
        );
      } else if (cases.every((row) => row.tagList.includes(MOCKED_TAG))) {
        findings.push(
          finding(
            'mocked-only',
            registry.file,
            line,
            `${requirement?.id} is covered only by @mocked cases (${cases.map((row) => row.id).join(', ')})`,
          ),
        );
      }
    }
  }
  return { rows, findings };
}

function main() {
  const { values } = parseArgs({ options: { root: { type: 'string' } } });
  const { rows, findings } = traceability(resolve(values.root ?? REPO_ROOT));
  if (rows.length === 0) console.log('traceability: no requirements yet.');
  else {
    console.log('| Registry | Requirement | Cases |\n|---|---|---|');
    for (const row of rows)
      console.log(`| ${row.file} | ${row.requirement} | ${row.cases.join(', ') || '-'} |`);
  }
  for (const f of findings) console.error(`${f.file}:${f.line}  ${f.rule}  ${f.message}`);
  process.exitCode = findings.length > 0 ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
