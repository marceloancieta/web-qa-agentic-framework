#!/usr/bin/env node
// Suite linter: the registries against themselves and against the specs. A registry is the
// reviewed design and a spec its automation; this linter keeps the two telling the same story.
//
//   registry-shape     the registry breaks its format (scripts/lib/registry.mjs): front matter,
//                      dimensions, the cases table, a cell's value.
//   contract-shape     a feature contract (apps/<pack>/docs/features/*.md, named by a registry or
//                      not yet) breaks its format (scripts/lib/contract.mjs): the business rules
//                      table, a rule's id or source.
//   missing-dimension  the header declares a quality dimension as `applies`, and no case carries
//                      its tag (scripts/lib/tags.mjs DIMENSIONS).
//   duplicate-case     the same case id in two registries of one pack (a feature may span files;
//                      a repeat inside one file is a registry-shape problem).
//   case-without-spec  an automated or published case with no test in its spec file whose title
//                      starts with its id (or a spec file that does not exist).
//   spec-without-case  a test whose title starts with a case id that no registry of its pack has.
//   tags-mismatch      a test's tags (with its describes') differ from its case's Tags cell.
//   status-behind      a test exists for a case still marked draft or approved; mark it automated.
//   decision-table-shape     a table in apps/<pack>/rules/ breaks its format
//                            (scripts/lib/decision-table.mjs), or names no decision-table case of
//                            its pack's registries.
//   decision-table-gap       a combination of condition values no rule of the table covers.
//   decision-table-conflict  two rules give the same combination different actions.
//   case-without-table       a decision-table case with no apps/<pack>/rules/<id>.yaml.
//   journey-tag        a case of a journey registry (`kind: journey`) without @e2e, or a case
//                      with @e2e in a feature's registry.
//   journey-chain      a rule of a journey's contract whose Source cites no feature rule, or cites
//                      one that no other contract of its pack has.
//
// Usage:
//   node scripts/lint-suite.mjs [--root <dir>]   the repository, or another tree
//   node scripts/lint-suite.mjs --self-test      exact check against the fixture tree
// Exit codes: 0 clean; 1 findings or an inexact self-test; 2 the linter could not run.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './lib/cli.mjs';
import { specCases } from './lib/corpus.mjs';
import { parseContractRules } from './lib/contract.mjs';
import { parseDecisionTable } from './lib/decision-table.mjs';
import { finding, report, selfTest } from './lib/lint.mjs';
import { applyingDimensions, isJourney, loadRegistries } from './lib/registry.mjs';
import { DIMENSIONS, E2E_TAG } from './lib/tags.mjs';

export const TOOL = 'lint-suite';
export const FIXTURES = join(import.meta.dirname, '__fixtures__', 'lint-suite');
export const RULES = [
  'registry-shape',
  'contract-shape',
  'missing-dimension',
  'duplicate-case',
  'case-without-spec',
  'spec-without-case',
  'tags-mismatch',
  'status-behind',
  'decision-table-shape',
  'decision-table-gap',
  'decision-table-conflict',
  'case-without-table',
  'journey-tag',
  'journey-chain',
];

const RULE_REF = /\bREQ-[A-Z][A-Z0-9]{1,9}-\d{2,3}\b/g;

/** The decision tables of every pack: apps/<pack>/rules/*.yaml, parsed, with their pack. */
function loadDecisionTables(root) {
  const apps = join(root, 'apps');
  if (!existsSync(apps)) return [];
  return readdirSync(apps)
    .sort()
    .flatMap((pack) => {
      const dir = join(apps, pack, 'rules');
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter((name) => /\.ya?ml$/.test(name))
        .sort()
        .map((name) => ({
          pack,
          ...parseDecisionTable(
            readFileSync(join(dir, name), 'utf8'),
            `apps/${pack}/rules/${name}`,
          ),
        }));
    });
}

/** The business rules of every contract under apps/<pack>/docs/features/. */
function loadContracts(root) {
  const apps = join(root, 'apps');
  if (!existsSync(apps)) return [];
  return readdirSync(apps)
    .sort()
    .flatMap((pack) => {
      const dir = join(apps, pack, 'docs', 'features');
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter((name) => name.endsWith('.md'))
        .sort()
        .map((name) =>
          parseContractRules(
            readFileSync(join(dir, name), 'utf8'),
            `apps/${pack}/docs/features/${name}`,
          ),
        );
    });
}

const sameSet = (a, b) =>
  a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ');

export function lintSuite(root = REPO_ROOT) {
  const findings = [];
  const add = (rule, file, line, message) => findings.push(finding(rule, file, line, message));
  const registries = loadRegistries(root);
  const tests = specCases(root);

  const casesByPack = new Map();
  const reported = new Set();
  const addOnce = (rule, problem) => {
    const key = `${rule} ${problem.file}:${problem.line} ${problem.message}`;
    if (reported.has(key)) return; // a contract two registries name, or one read again below
    reported.add(key);
    add(rule, problem.file, problem.line, problem.message);
  };
  // Every contract, so intake's gate checks one before any registry names it.
  const contracts = loadContracts(root);
  for (const contract of contracts)
    for (const problem of contract.problems) addOnce('contract-shape', problem);
  const checkedChains = new Set();
  for (const registry of registries) {
    for (const problem of registry.problems) addOnce(problem.kind ?? 'registry-shape', problem);
    const journey = isJourney(registry);
    for (const row of registry.cases.filter((r) => r.tagList.includes(E2E_TAG) !== journey)) {
      add(
        'journey-tag',
        registry.file,
        row.line,
        journey
          ? `${row.id} is a journey's case and carries ${E2E_TAG}`
          : `${row.id} carries ${E2E_TAG}, which only a journey registry's cases carry (kind: journey)`,
      );
    }
    if (journey && registry.contractFile && !checkedChains.has(registry.contractFile)) {
      checkedChains.add(registry.contractFile);
      // The rules of the pack's other contracts: the features a journey chains.
      const packFeatures = `apps/${registry.pack}/docs/features/`;
      const featureRules = new Set(
        contracts
          .filter((c) => c.file.startsWith(packFeatures) && c.file !== registry.contractFile)
          .flatMap((c) => c.rules.map((rule) => rule.id)),
      );
      for (const rule of registry.contractRules) {
        const cited = rule.source.match(RULE_REF) ?? [];
        const unknown = cited.filter((id) => !featureRules.has(id));
        if (cited.length === 0 || unknown.length > 0) {
          add(
            'journey-chain',
            registry.contractFile,
            rule.line,
            cited.length === 0
              ? `${rule.id}: a journey's rule cites in its Source the feature rules it chains`
              : `${rule.id} cites ${unknown.join(', ')}, which no other contract of ${registry.pack} has`,
          );
        }
      }
    }
    for (const name of applyingDimensions(registry)) {
      const tag = DIMENSIONS[name];
      if (!registry.cases.some((row) => row.tagList.includes(tag))) {
        const line = registry.keyLines?.get(`dimensions.${name}`) ?? 1;
        add(
          'missing-dimension',
          registry.file,
          line,
          `dimensions.${name} applies, but no case carries ${tag}`,
        );
      }
    }
    const cases = casesByPack.get(registry.pack) ?? new Map();
    for (const row of registry.cases) {
      const earlier = cases.get(row.id);
      if (earlier && earlier.file !== registry.file) {
        add('duplicate-case', registry.file, row.line, `${row.id} is also in ${earlier.file}`);
      } else if (!earlier) cases.set(row.id, { ...row, file: registry.file });
    }
    casesByPack.set(registry.pack, cases);
  }

  for (const test of tests.filter((t) => t.id)) {
    const row = casesByPack.get(test.pack)?.get(test.id);
    if (!row) {
      add(
        'spec-without-case',
        test.file,
        test.line,
        `${test.id} is not a case of any apps/${test.pack} registry`,
      );
      continue;
    }
    if (!sameSet(test.tags, row.tagList)) {
      add(
        'tags-mismatch',
        test.file,
        test.line,
        `${test.id} has ${test.tags.join(' ') || 'no tags'}; its case has ${row.tags || 'none'}`,
      );
    }
    if (['draft', 'approved'].includes(row.status)) {
      add(
        'status-behind',
        row.file,
        row.line,
        `${row.id} has a test in ${test.file} but is still ${row.status}`,
      );
    }
  }

  const tables = loadDecisionTables(root);
  for (const table of tables) {
    for (const problem of table.problems)
      add(problem.rule, problem.file, problem.line, problem.message);
    const row = casesByPack.get(table.pack)?.get(table.id);
    if (!row) {
      add(
        'decision-table-shape',
        table.file,
        1,
        `${table.id} is not a case of any apps/${table.pack} registry`,
      );
    } else if (row.technique !== 'decision-table') {
      add(
        'decision-table-shape',
        table.file,
        1,
        `${table.id} is a ${row.technique} case; a table belongs to a decision-table case`,
      );
    }
  }
  for (const [pack, cases] of casesByPack) {
    for (const row of cases.values()) {
      if (row.technique !== 'decision-table') continue;
      if (!tables.some((table) => table.pack === pack && table.id === row.id))
        add(
          'case-without-table',
          row.file,
          row.line,
          `${row.id} is a decision-table case; its table goes in apps/${pack}/rules/${row.id}.yaml`,
        );
    }
  }

  for (const [pack, cases] of casesByPack) {
    for (const row of cases.values()) {
      if (!['automated', 'published'].includes(row.status) || !row.spec) continue;
      const specFile = `apps/${pack}/${row.spec}`;
      const automated = tests.some((test) => test.file === specFile && test.id === row.id);
      if (!existsSync(join(root, specFile))) {
        add(
          'case-without-spec',
          row.file,
          row.line,
          `${row.id} names ${row.spec}, which does not exist`,
        );
      } else if (!automated) {
        add(
          'case-without-spec',
          row.file,
          row.line,
          `${row.id} is ${row.status}, but ${row.spec} has no test titled with its id`,
        );
      }
    }
  }
  return findings;
}

function main() {
  const { values } = parseArgs({
    options: { 'self-test': { type: 'boolean', default: false }, root: { type: 'string' } },
  });
  if (values['self-test']) {
    process.exitCode = selfTest(TOOL, FIXTURES, lintSuite(FIXTURES));
    return;
  }
  process.exitCode = report(TOOL, lintSuite(resolve(values.root ?? REPO_ROOT)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(`${TOOL}: ${error.message}`);
    process.exitCode = 2;
  }
}
