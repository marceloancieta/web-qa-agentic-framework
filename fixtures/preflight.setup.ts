// Preflight: runs once before a pack's device projects and stops the pack with one readable failure
// when it cannot work, instead of every case timing out on its own. The pack comes from the
// project's metadata; a pack the active environment does not configure fails here with the
// reason. Skip it with `--no-deps` when the cause is known and the cases should run anyway.

import { test as setup } from '@playwright/test';
import {
  loadRuntime,
  missingEnvVars,
  packVariable,
  projectPack,
  requiredEnvVars,
  type QaRuntime,
} from '../helpers/config';
import { missingActorVariables } from '../helpers/preflight';

const REACHABILITY_TIMEOUT_MS = 5_000;

function packRuntime(): QaRuntime {
  return loadRuntime(projectPack(setup.info().project));
}

setup('the variables of every actor are set', () => {
  const qa = packRuntime();
  const problem = missingActorVariables(qa, (actor) => missingEnvVars(requiredEnvVars(actor)));
  if (problem) throw new Error(problem);
});

setup('the application answers', async ({ request }) => {
  const qa = packRuntime();
  try {
    // Any HTTP answer, even an error status, proves the host is there.
    await request.get(`${qa.baseUrl}/`, { timeout: REACHABILITY_TIMEOUT_MS, maxRedirects: 0 });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message.split('\n')[0] : String(cause);
    throw new Error(
      `${qa.baseUrl} (pack "${qa.pack}", environment "${qa.environment}") does not answer: ` +
        `${reason}. Start the application or fix the network path, set ` +
        `${packVariable(qa.pack, 'BASE_URL')} for a one-off URL, or choose another environment ` +
        `with QA_ENV. No case of pack "${qa.pack}" ran.`,
      { cause },
    );
  }
});
