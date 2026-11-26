// What every page of the dashboard is drawn on: the document's body, which carries the page's
// background and the text every component inherits (contract docs/features/design.md,
// REQ-DESIGN-01), and which a case reads motion under.

import type { Locator, Page } from '@playwright/test';

export class PageFrame {
  constructor(private readonly page: Page) {}

  /** The document's body. It has no role or name, being the page itself, so it is found by tag. */
  body(): Locator {
    return this.page.locator('body');
  }
}
