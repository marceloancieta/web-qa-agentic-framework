// The last reporter of every run: once all the others have written their output, it removes the
// secrets the workers remembered (helpers/run-secrets.ts) from the run's artifacts - each project's
// output folder, the HTML report, the Allure results, a blob report and any extra report file -
// and then deletes the record of those secrets.

import { dirname, resolve } from 'node:path';
import type { FullConfig, Reporter } from '@playwright/test/reporter';
import { redactArtifacts } from './redact-artifacts';
import { jsonReportFile } from './run-options';
import { forgetRunSecrets, runSecrets } from './run-secrets';

export default class RedactReporter implements Reporter {
  private roots: string[] = [];

  onBegin(config: FullConfig): void {
    const base = config.configFile ? dirname(config.configFile) : config.rootDir;
    const extra = [jsonReportFile(), process.env.QA_JUNIT_REPORT].filter((file): file is string =>
      Boolean(file),
    );
    this.roots = [
      ...config.projects.map((project) => project.outputDir),
      process.env.PLAYWRIGHT_HTML_OUTPUT_DIR ?? 'playwright-report',
      'allure-results',
      'blob-report',
      ...extra,
    ].map((path) => resolve(base, path));
  }

  async onExit(): Promise<void> {
    const secrets = runSecrets();
    if (secrets.length === 0) return;
    const { redacted } = redactArtifacts(this.roots, secrets);
    forgetRunSecrets();
    if (redacted.length > 0) {
      console.log(`redact: removed the run's secrets from ${redacted.length} artifact(s).`);
    }
  }

  printsToStdio(): boolean {
    return false;
  }
}
