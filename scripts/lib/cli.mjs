// Shared building blocks for the command-line tools in scripts/. The app-pack helpers (pack names,
// the active qa-config environment, per-pack URL overrides) join them with the execution core.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A text file's content, or null when it does not exist. Reading and treating a missing file as a
 * normal outcome in one step leaves no gap between a check and the use that follows it.
 */
export function readTextIfExists(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
