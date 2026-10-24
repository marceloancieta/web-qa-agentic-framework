// The checks of the preflight project, as functions a unit test can call without a browser.

import type { ActorConfig, QaRuntime } from './config';
import { redactUnlessVariableName } from '../scripts/lib/env-names.mjs';

/**
 * The message for the variables the pack's actors need and the environment does not set, each
 * with the actors that need it, or null when nothing is missing. Names only, never values.
 */
export function missingActorVariables(
  qa: Pick<QaRuntime, 'pack' | 'source' | 'environment' | 'actors'>,
  missingFor: (actor: ActorConfig) => string[],
): string | null {
  const missing = new Map<string, string[]>();
  for (const [name, actor] of Object.entries(qa.actors)) {
    for (const variable of missingFor(actor)) {
      missing.set(variable, [...(missing.get(variable) ?? []), name]);
    }
  }
  if (missing.size === 0) return null;
  const listed = [...missing].map(
    ([variable, actors]) => `${redactUnlessVariableName(variable)} (${actors.join(', ')})`,
  );
  return (
    `Missing environment variables for pack "${qa.pack}": ${listed.join(', ')}. They are named ` +
    `in ${qa.source} at app.environments.${qa.environment}.packs.${qa.pack}.actors. Set them in ` +
    'the shell, the CI secret store or the local .env file.'
  );
}
