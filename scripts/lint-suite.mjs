#!/usr/bin/env node
// Suite linter: the registries against themselves and against the specs. A registry is the
// reviewed design and a spec its automation; this linter keeps the two telling the same story.
//
//   registry-shape     the registry breaks its format (scripts/lib/registry.mjs): front matter,
//                      dimensions, the cases table, a cell's value.
//   missing-dimension  the header declares a quality dimension as `applies`, and no case carries
//                      its tag (scripts/lib/tags.mjs DIMENSIONS).
//   duplicate-case     the same case id in two registries of one pack (a feature may span files;
//                      a repeat inside one file is a registry-shape problem).
//   case-without-spec  an automated or published case with no test in its spec file whose title
//                      starts with its id (or a spec file that does not exist).
//   spec-without-case  a test whose title starts with a case id that no registry of its pack has.
//   tags-mismatch      a test's tags (with its describes') differ from its case's Tags cell.
//   status-behind      a test exists for a case still marked draft or approved; mark it automated.
//
// Usage:
//   node scripts/lint-suite.mjs [--root <dir>]   the repository, or another tree
//   node scripts/lint-suite.mjs --self-test      exact check against the fixture tree
// Exit codes: 0 clean; 1 findings or an inexact self-test; 2 the linter could not run.

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './lib/cli.mjs';
import { specCases } from './lib/corpus.mjs';
import { finding, report, selfTest } from './lib/lint.mjs';
import { applyingDimensions, loadRegistries } from './lib/registry.mjs';
import { DIMENSIONS } from './lib/tags.mjs';

export const TOOL = 'lint-suite';
export const FIXTURES = join(import.meta.dirname, '__fixtures__', 'lint-suite');
export const RULES = [
  'registry-shape',
  'missing-dimension',
  'duplicate-case',
  'case-without-spec',
  'spec-without-case',
  'tags-mismatch',
  'status-behind',
];

const sameSet = (a, b) =>
  a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ');

export function lintSuite(root = REPO_ROOT) {
  const findings = [];
  const add = (rule, file, line, message) => findings.push(finding(rule, file, line, message));
  const registries = loadRegistries(root);
  const tests = specCases(root);

  const casesByPack = new Map();
  for (const registry of registries) {
    for (const problem of registry.problems)
      add('registry-shape', problem.file, problem.line, problem.message);
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
