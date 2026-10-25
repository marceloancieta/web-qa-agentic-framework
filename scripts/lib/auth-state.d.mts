// Types for scripts/lib/auth-state.mjs.

export function statePath(
  authDir: string,
  environment: string,
  pack: string,
  role: string,
  worker: number,
): string;
export function latestStatePath(
  authDir: string,
  environment: string,
  pack: string,
  role: string,
): string | null;
export function readState(file: string): {
  storageState: { cookies: unknown[]; origins: unknown[] };
  sessionStorage: { origin: string; items: Record<string, string> }[];
};
