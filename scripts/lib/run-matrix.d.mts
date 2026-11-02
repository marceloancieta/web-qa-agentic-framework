// Types for scripts/lib/run-matrix.mjs.

export interface DeviceProjectFactors {
  name: string;
  browser: string;
  formFactor: string;
}

export interface Run {
  project: string;
  role: string;
}

export const ANONYMOUS_ROLE: string;
export function packRoles(entry: { actors?: Record<string, unknown> } | null | undefined): string[];
export function parseRun(text: string): Run | null;
export function runSet(projects: DeviceProjectFactors[], roles: string[]): Run[];
export function fullRunCount(projects: DeviceProjectFactors[], roles: string[]): number;
export function runGaps(
  runs: Run[],
  catalog: DeviceProjectFactors[],
  roles: string[],
): { unknown: Run[]; missing: string[] };
export function projectGaps(names: string[], catalog: DeviceProjectFactors[]): string[];
