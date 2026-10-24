// Types for scripts/lib/tags.mjs.

export const LAYER_TAGS: string[];
export const DIMENSION_TAGS: string[];
export const HANDLING_TAGS: string[];
export const TAGS: string[];
export const VISUAL_TAG: string;
export const QUARANTINE_TAG: string;
export const DESTRUCTIVE_TAG: string;
export const DESKTOP_ONLY_TAG: string;
export const MOBILE_ONLY_TAG: string;
export const DESTRUCTIVE_LANE_ENV: string;
export const FLAKE_LANE_ENV: string;
export const VISUAL_LANE_ENV: string;
export function projectTagFilter(
  formFactor: 'desktop' | 'tablet' | 'mobile',
  env?: Record<string, string | undefined>,
): { grep?: RegExp; grepInvert: RegExp };
