// Case metadata for the results, in the Allure format every test-management adapter reads.
//
// Identity. A reporter derives a case id from the file path and the describe blocks, so moving or
// renaming a spec would create a new case and orphan the published one. A test whose title starts
// with its designed id (`TC-LOGIN-01 ...`) gets `<pack>-<version>-<TC id>` instead: it survives
// refactors and stays unique when two versions of an application share case numbers.
//
// Tags written in the title or in `{ tag }` are copied to the results by allure-playwright itself,
// so the title stays the one place a tag is written.

import { test, type TestInfo } from '@playwright/test';
import * as allure from 'allure-js-commons';
import type { AppPack } from './app-pack';
import { loadSettings, type QaSettings } from './config';

const CASE_ID = /^(TC-[A-Z][A-Z0-9]*-\d{2,3})\b/;

/** The designed case id at the start of a title, or null. */
export function caseIdFromTitle(title: string): string | null {
  return CASE_ID.exec(title)?.[1] ?? null;
}

/** `<pack>-<version>-<TC id>`, or null when the title carries no case id. */
export function caseIdentity(app: Pick<AppPack, 'name' | 'version'>, title: string): string | null {
  const id = caseIdFromTitle(title);
  return id ? `${app.name}-${app.version}-${id}` : null;
}

/** The labels every case of a pack gets; the core's automatic fixture calls it. */
export async function applyCaseMeta(app: AppPack, testInfo: TestInfo): Promise<void> {
  const run = process.env.QA_RUN_ID;
  if (run) await allure.label('run', run);
  await allure.parentSuite(app.title);
  await allure.suite(app.version);
  const device = testInfo.project.metadata?.device;
  if (typeof device === 'string') await allure.label('device', device);
  const identity = caseIdentity(app, testInfo.title);
  if (identity) {
    await allure.testCaseId(identity);
    await allure.historyId(`${identity}@${device ?? testInfo.project.name}`);
  }
}

/**
 * Record which open issue explains a case expected to fail, and return the reason for the arm:
 *
 *     test.fail(true, await knownGap('LOCAL-12', 'the basket keeps a removed item'));
 *
 * The arm stays in the spec, where the linters see it; this helper makes the link impossible to
 * forget. A key that does not match `tracker.key_pattern` fails here, because a link to a mistyped
 * key reads as tracked when it is not.
 */
export async function knownGap(key: string, why: string): Promise<string> {
  const { tracker, source } = loadSettings();
  await allure.issue(issueUrl(tracker, key, source), key);
  test.info().annotations.push({ type: 'issue', description: key });
  return `${key}: ${why}`;
}

/** The link to issue `key`, after checking the key against the tracker configuration. */
export function issueUrl(
  tracker: QaSettings['tracker'],
  key: string,
  source = 'qa-config',
): string {
  if (!tracker.keyPattern || !tracker.issueUrl) {
    throw new Error(
      `knownGap('${key}') needs tracker.key_pattern and tracker.issue_url in ${source}. ` +
        'A gap without a filed issue is a note, not a known gap.',
    );
  }
  if (!new RegExp(`^(?:${tracker.keyPattern})$`).test(key)) {
    throw new Error(`knownGap('${key}'): not a key matching tracker.key_pattern in ${source}.`);
  }
  // A GitHub key is written `#123`; its URL takes the number.
  return tracker.issueUrl.replace('{key}', encodeURIComponent(key.replace(/^#/, '')));
}
