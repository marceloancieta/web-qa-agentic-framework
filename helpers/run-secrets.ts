// The secrets a run learns while it runs: generated passwords, the passwords of existing accounts,
// the tokens a login answers with. Each worker writes what it learns to a file of its own under
// `.auth/run-secrets/<run>/`, which git ignores and the secret guard protects, so that once every
// reporter has written its output the redaction reporter can remove them from the artifacts
// (helpers/redact-artifacts.ts) and then delete the files.
//
// A run is identified by the process of the test runner: the workers are its children, and the
// reporters run in it. Runs that overlap on one machine each keep and forget their own secrets.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** Where the runs keep their secrets until each run's artifacts are redacted. */
export const RUN_SECRETS_ROOT = join(__dirname, '..', '.auth', 'run-secrets');

/** The folder of the run a worker belongs to: named after its parent, the test runner. */
export const workerRunDir = (): string => join(RUN_SECRETS_ROOT, String(process.ppid));

/** The folder of the run the current process leads, for the reporter in the test runner. */
export const runnerRunDir = (): string => join(RUN_SECRETS_ROOT, String(process.pid));

/** Values shorter than this are not secrets worth scrubbing and would mask ordinary text. */
const MINIMUM_LENGTH = 6;

/** Remember a secret the run learned, so the artifacts are redacted of it at the end. */
export function rememberSecret(value: string, dir = workerRunDir()): void {
  if (value.length < MINIMUM_LENGTH) return;
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, `${process.pid}.jsonl`), `${JSON.stringify(value)}\n`);
}

/** Every secret the run's workers remembered. */
export function runSecrets(dir = runnerRunDir()): string[] {
  if (!existsSync(dir)) return [];
  const values = readdirSync(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .flatMap((name) => readFileSync(join(dir, name), 'utf8').split('\n'))
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string);
  return [...new Set(values)];
}

/** Forget this run's secrets only; other runs on the machine keep theirs. */
export function forgetRunSecrets(dir = runnerRunDir()): void {
  rmSync(dir, { recursive: true, force: true });
}
