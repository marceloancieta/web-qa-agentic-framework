// The secrets a run learns while it runs: generated passwords, the passwords of existing accounts,
// the tokens a login answers with. Each worker writes what it learns to a file of its own under
// `.auth/run-secrets/`, which git ignores and the secret guard protects, so that once every
// reporter has written its output the redaction reporter can remove them from the artifacts
// (helpers/redact-artifacts.ts) and then delete the files.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** Where the workers keep the run's secrets until the run's artifacts are redacted. */
export const RUN_SECRETS_DIR = join(__dirname, '..', '.auth', 'run-secrets');

/** Values shorter than this are not secrets worth scrubbing and would mask ordinary text. */
const MINIMUM_LENGTH = 6;

/** Remember a secret the run learned, so the artifacts are redacted of it at the end. */
export function rememberSecret(value: string, dir = RUN_SECRETS_DIR): void {
  if (value.length < MINIMUM_LENGTH) return;
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, `${process.pid}.jsonl`), `${JSON.stringify(value)}\n`);
}

/** Every secret the run's workers remembered. */
export function runSecrets(dir = RUN_SECRETS_DIR): string[] {
  if (!existsSync(dir)) return [];
  const values = readdirSync(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .flatMap((name) => readFileSync(join(dir, name), 'utf8').split('\n'))
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string);
  return [...new Set(values)];
}

export function forgetRunSecrets(dir = RUN_SECRETS_DIR): void {
  rmSync(dir, { recursive: true, force: true });
}
