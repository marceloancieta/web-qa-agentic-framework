// The tag taxonomy, defined here and nowhere else. The tagging rule explains when each tag applies,
// and the linters report any tag missing from these lists.

/** Exactly one per designed case: the depth of the run that selects it. */
export const LAYER_TAGS = ['@smoke', '@sanity', '@regression'];

/**
 * The UI quality dimensions (architecture section 6b), each with its tag. A registry declares in its
 * header whether each one applies to the feature, and a dimension that applies needs a case with
 * its tag.
 */
export const DIMENSIONS = {
  responsive: '@responsive',
  perf: '@perf',
  security: '@security',
  layout: '@layout',
  navigation: '@navigation',
  a11y: '@a11y',
  content: '@content',
};

export const DIMENSION_TAGS = Object.values(DIMENSIONS);

/** How a case is run or where it applies. */
export const HANDLING_TAGS = [
  '@visual',
  '@a11y-sweep',
  '@i18n',
  '@mocked',
  '@known-gap',
  '@quarantine',
  '@destructive',
  '@desktop-only',
  '@mobile-only',
  '@not-webkit',
  '@e2e',
];

export const TAGS = [...LAYER_TAGS, ...DIMENSION_TAGS, ...HANDLING_TAGS];

export const VISUAL_TAG = '@visual';
/** A test of the accessibility sweep over the app maps; not a designed case. */
export const A11Y_SWEEP_TAG = '@a11y-sweep';
export const MOCKED_TAG = '@mocked';
export const KNOWN_GAP_TAG = '@known-gap';
export const QUARANTINE_TAG = '@quarantine';
export const DESTRUCTIVE_TAG = '@destructive';
export const DESKTOP_ONLY_TAG = '@desktop-only';
export const MOBILE_ONLY_TAG = '@mobile-only';
/** A case the WebKit engine cannot drive, for a reason the registry's Devices cell gives. */
export const NOT_WEBKIT_TAG = '@not-webkit';
/** A journey's case: it crosses features end to end, and only a journey registry holds it. */
export const E2E_TAG = '@e2e';

/** Set to `1` by the destructive lane only: the run selects the `@destructive` cases. */
export const DESTRUCTIVE_LANE_ENV = 'QA_DESTRUCTIVE';

/** Set to `1` by the flake lane only: the run keeps the `@quarantine` cases. */
export const FLAKE_LANE_ENV = 'QA_INCLUDE_QUARANTINE';

/** Set to `1` by the visual lane only, inside the pinned container: the run selects `@visual`. */
export const VISUAL_LANE_ENV = 'QA_VISUAL';

/** Set to `1` by the a11y lane only: the run selects the `@a11y-sweep` tests. */
export const A11Y_SWEEP_LANE_ENV = 'QA_A11Y_SWEEP';

// A tag in Playwright's grep text (title path plus tags), not the start of a longer word.
const anyTag = (tags) => new RegExp(`(?:${tags.join('|')})(?![\\w-])`);

/**
 * The `grep` and `grepInvert` of a pack's device project. `formFactor` is the project's
 * (`desktop`, `tablet` or `mobile`): desktop projects leave out `@mobile-only` cases, tablet and
 * mobile projects leave out `@desktop-only` ones, and the projects of the `webkit` `engine` leave out
 * `@not-webkit` ones. Every run also leaves out
 * - `@destructive` cases, which break the application for everyone else until it recovers; the
 *   destructive lane selects only them instead;
 * - `@quarantine` cases, confirmed flaky; the flake lane keeps them;
 * - `@visual` cases, whose baselines exist only for the pinned container; the visual lane selects
 *   only them;
 * - `@a11y-sweep` tests, one per route of the app maps; the a11y lane selects only them.
 * A lane selects one kind at a time. A command-line `--grep` narrows this further, never widens it.
 */
export function projectTagFilter(formFactor, env = process.env, engine = undefined) {
  const lane = [
    [DESTRUCTIVE_LANE_ENV, DESTRUCTIVE_TAG],
    [VISUAL_LANE_ENV, VISUAL_TAG],
    [A11Y_SWEEP_LANE_ENV, A11Y_SWEEP_TAG],
  ].find(([name]) => env[name] === '1');
  const keepQuarantine = env[FLAKE_LANE_ENV] === '1';
  const leftOut = [
    formFactor === 'desktop' ? MOBILE_ONLY_TAG : DESKTOP_ONLY_TAG,
    ...(engine === 'webkit' ? [NOT_WEBKIT_TAG] : []),
    ...[DESTRUCTIVE_TAG, VISUAL_TAG, A11Y_SWEEP_TAG].filter((tag) => tag !== lane?.[1]),
    ...(keepQuarantine ? [] : [QUARANTINE_TAG]),
  ];
  return { ...(lane ? { grep: anyTag([lane[1]]) } : {}), grepInvert: anyTag(leftOut) };
}
