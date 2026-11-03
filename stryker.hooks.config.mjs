// The mutation run of .claude/hooks/lib; see stryker.config.mjs for both runs.
//
// The hook suites reach the library by running each hook as a child process. The tap runner reads
// coverage only from the test process, so it would report every mutant here as not covered without
// running it. The command runner runs the hook suites whole for each mutant instead (about two
// seconds), and the mutant reaches the children through the environment they inherit.
import { base, reportsOf } from './stryker.config.mjs';

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  ...base,
  ...reportsOf('hooks-lib'),
  testRunner: 'command',
  commandRunner: { command: 'node --test .claude/hooks/__tests__/*.test.mjs' },
  mutate: ['.claude/hooks/lib/**/*.mjs'],
  coverageAnalysis: 'off',
};
