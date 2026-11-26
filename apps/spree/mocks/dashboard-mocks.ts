// The home dashboard's reports, held back so its loading placeholders stay on the page for a case
// about them (contract docs/features/design.md, REQ-DESIGN-10). The answers are the real ones once
// released.

import type { Page } from '@playwright/test';
import { hold } from '../../../helpers/network';

/** The request every report widget of the home dashboard sends (docs/app-notes.md, Pages). */
export const REPORTS = /\/api\/v3\/admin\/reporting\/query$/;

/** Hold the reports' answers until `release()`; the case releases them before it ends. */
export async function holdReports(page: Page): Promise<{ release(): void }> {
  return hold(page, (url) => REPORTS.test(url.pathname));
}
