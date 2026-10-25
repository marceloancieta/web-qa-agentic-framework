#!/usr/bin/env node
/**
 * Traceability: every requirement a registry declares and every business rule of the feature
 * contracts the registries name (the cited status), with the cases that cover each.
 *
 *   uncovered-requirement   no case names a requirement of a registry's header.
 *   uncited-rule            no case, in any registry that names the contract, cites the rule.
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
  const check = (file, line, id, cases, uncovered) => {
    rows.push({ file, requirement: id, cases: cases.map((row) => row.id) });
    if (cases.length === 0) findings.push(finding(...uncovered));
    else if (cases.every((row) => row.tagList.includes(MOCKED_TAG))) {
      findings.push(
        finding(
          'mocked-only',
          file,
          line,
          `${id} is covered only by @mocked cases (${cases.map((row) => row.id).join(', ')})`,
        ),
      );
    }
  };
  const registries = loadRegistries(root);
  for (const registry of registries) {
    const line = registry.keyLines?.get('requirements') ?? 1;
    for (const requirement of registry.requirements) {
      const id = requirement?.id;
      const cases = registry.cases.filter((row) => row.requirement === id);
      check(registry.file, line, id, cases, [
        'uncovered-requirement',
        registry.file,
        line,
        `${id} has no case`,
      ]);
    }
  }
  // A contract's rules may be cited from every registry that names it: files are containers.
  const contracts = new Map();
  for (const registry of registries.filter((r) => r.contractFile)) {
    const entry = contracts.get(registry.contractFile) ?? {
      rules: registry.contractRules,
      cases: [],
    };
    entry.cases.push(...registry.cases);
    contracts.set(registry.contractFile, entry);
  }
  for (const [file, { rules, cases }] of contracts) {
    for (const rule of rules) {
      const citing = cases.filter((row) => row.requirement === rule.id);
      check(file, rule.line, rule.id, citing, [
        'uncited-rule',
        file,
        rule.line,
        `${rule.id} is not cited by any case`,
      ]);
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
