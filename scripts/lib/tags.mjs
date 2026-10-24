// The tag taxonomy, defined here and nowhere else. The tagging rule explains when each tag applies,
// and the suite linter reports any tag missing from these lists.

/** Exactly one per designed case: the depth of the run that selects it. */
export const LAYER_TAGS = ['@smoke', '@sanity', '@regression'];

/** One per UI quality dimension a case covers (architecture section 6b). */
export const DIMENSION_TAGS = ['@responsive', '@perf', '@security', '@a11y', '@visual', '@i18n'];

/** How a case is run or where it applies. */
export const HANDLING_TAGS = [
  '@mocked',
  '@known-gap',
  '@quarantine',
  '@destructive',
  '@desktop-only',
  '@mobile-only',
];

export const TAGS = [...LAYER_TAGS, ...DIMENSION_TAGS, ...HANDLING_TAGS];

export const VISUAL_TAG = '@visual';
export const QUARANTINE_TAG = '@quarantine';
export const DESTRUCTIVE_TAG = '@destructive';
export const DESKTOP_ONLY_TAG = '@desktop-only';
export const MOBILE_ONLY_TAG = '@mobile-only';

/** Set to `1` by the destructive lane only: the run selects the `@destructive` cases. */
export const DESTRUCTIVE_LANE_ENV = 'QA_DESTRUCTIVE';

/** Set to `1` by the flake lane only: the run keeps the `@quarantine` cases. */
export const FLAKE_LANE_ENV = 'QA_INCLUDE_QUARANTINE';

/** Set to `1` by the visual lane only, inside the pinned container: the run selects `@visual`. */
export const VISUAL_LANE_ENV = 'QA_VISUAL';

// A tag in Playwright's grep text (title path plus tags), not the start of a longer word.
const anyTag = (tags) => new RegExp(`(?:${tags.join('|')})(?![\\w-])`);

/**
 * The `grep` and `grepInvert` of a pack's device project. `formFactor` is the project's
 * (`desktop`, `tablet` or `mobile`): desktop projects leave out `@mobile-only` cases, tablet and
 * mobile projects leave out `@desktop-only` ones. Every run also leaves out
 * - `@destructive` cases, which break the application for everyone else until it recovers; the
 *   destructive lane selects only them instead;
 * - `@quarantine` cases, confirmed flaky; the flake lane keeps them;
 * - `@visual` cases, whose baselines exist only for the pinned container; the visual lane selects
 *   only them.
 * A lane selects one kind at a time. A command-line `--grep` narrows this further, never widens it.
 */
export function projectTagFilter(formFactor, env = process.env) {
  const lane = [
    [DESTRUCTIVE_LANE_ENV, DESTRUCTIVE_TAG],
    [VISUAL_LANE_ENV, VISUAL_TAG],
  ].find(([name]) => env[name] === '1');
  const keepQuarantine = env[FLAKE_LANE_ENV] === '1';
  const leftOut = [
    formFactor === 'desktop' ? MOBILE_ONLY_TAG : DESKTOP_ONLY_TAG,
    ...[DESTRUCTIVE_TAG, VISUAL_TAG].filter((tag) => tag !== lane?.[1]),
    ...(keepQuarantine ? [] : [QUARANTINE_TAG]),
  ];
  return { ...(lane ? { grep: anyTag([lane[1]]) } : {}), grepInvert: anyTag(leftOut) };
}
