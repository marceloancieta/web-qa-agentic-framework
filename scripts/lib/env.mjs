// Values that tools read from the environment (test management and tracker credentials, demo
// accounts). They come from variables named in qa-config, never from command-line arguments, which
// shells and CI logs keep. The local env file at the repository root fills in only what the real
// environment does not set, so a CI secret is never shadowed by a stray local file.

import { join } from 'node:path';
import { REPO_ROOT } from './cli.mjs';
import { missingVariableMessage } from './env-names.mjs';

/** Load the local env file into process.env, keeping variables already set. A missing file is normal. */
export function loadLocalEnv(root = REPO_ROOT) {
  try {
    process.loadEnvFile(join(root, '.env'));
  } catch {
    // No local env file: everything comes from the real environment.
  }
}

/** The value of a variable a tool needs, or an error that names the variable (never a value). */
export function credential(env, name, why) {
  const value = env[name]?.trim();
  if (!value) throw new Error(missingVariableMessage(why, name));
  return value;
}
