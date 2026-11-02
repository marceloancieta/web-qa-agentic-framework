// Mutation testing of the libraries the checks are built on (FUT-15): `npm run mutation`.
//
// Stryker changes one expression at a time and runs the `node:test` suites against it; a mutant no
// test notices is a gap in the tests. It runs on demand, never inside `npm run gates`: a run takes
// minutes, not seconds. The score is judged by the quality gate against qa-config
// `quality_gate.mutation`, so Stryker's own thresholds stay neutral.
//
// Two runs, one per library, because their suites reach them differently:
//   stryker.config.mjs        scripts/lib, imported by the suites in-process, so per-test coverage
//                             picks the suites each mutant needs.
//   stryker.hooks.config.mjs  .claude/hooks/lib, which the hook suites reach by running each hook
//                             as a child process; per-test coverage cannot see into a child, so
//                             every mutant runs the hook suites (about two seconds) instead.

/** What both runs share. */
export const base = {
  // The mutated files are plain JavaScript, and the suites compare some TypeScript files of the
  // sandbox with their text, so no `// @ts-nocheck` is added to them.
  disableTypeChecks: false,
  // A suite that waits on a child process can be slow under load; a timeout counts as detected.
  timeoutMS: 20_000,
  reporters: ['clear-text', 'progress', 'html', 'json'],
  thresholds: { high: 100, low: 0, break: null },
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};

/** The report files of a run named `name` under reports/mutation/. */
export const reportsOf = (name) => ({
  htmlReporter: { fileName: `reports/mutation/${name}.html` },
  jsonReporter: { fileName: `reports/mutation/${name}.json` },
});

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  ...base,
  ...reportsOf('scripts-lib'),
  mutate: ['scripts/lib/**/*.mjs'],
  testRunner: 'tap',
  plugins: ['@stryker-mutator/tap-runner'],
  tap: { testFiles: ['scripts/__tests__/*.test.mjs'] },
  coverageAnalysis: 'perTest',
};
