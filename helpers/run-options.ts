// Options of one run that come from the environment rather than from qa-config, because they
// change how a run is watched, not what it tests.

/** Room the test timeout keeps for slowed actions: a case with more actions than this times out. */
export const SLOWED_ACTIONS = 100;

/**
 * QA_SLOWMO: milliseconds the browser waits before each action, so a headed run can be followed by
 * eye. Unset or 0 means full speed; anything else than a whole number is refused.
 */
export function slowMoMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.QA_SLOWMO ?? '0';
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(value) || value < 0) {
    throw new Error(`QA_SLOWMO must be a whole number of milliseconds, such as 800, got "${raw}".`);
  }
  return value;
}

/**
 * The JSON report of a run, which the quality gate reads: QA_JSON_REPORT, or reports/playwright.json
 * relative to the repository.
 */
export function jsonReportFile(env: NodeJS.ProcessEnv = process.env): string {
  return env.QA_JSON_REPORT || 'reports/playwright.json';
}

/** The test timeout for a run: the base, plus the time slowed actions take. */
export function testTimeoutMs(baseMs: number, slowMo: number): number {
  return baseMs + slowMo * SLOWED_ACTIONS;
}
