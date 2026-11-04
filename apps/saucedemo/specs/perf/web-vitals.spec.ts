// Web vitals (`@web-vitals`, selected only by the web vitals lane, on one worker): LCP, CLS and INP
// of the login page against the budget qa-config gives the pack in the environment
// (`performance.web_vitals`). Not a registry case, so the title carries no case id. Swag Labs is a
// public demo run by a third party: one page, anonymous, a few visits per device, and the
// interaction INP needs clicks into the Username field without typing or sending anything.
// Engines without the entry types (Firefox, WebKit) skip with the reason.

import { LoginPage } from '../../pages/login-page';
import { expect, test } from '../../fixtures';

test.describe('web vitals', { tag: ['@regression', '@web-vitals'] }, () => {
  // The subject is how fast the page is. What the page health guard finds on it belongs to the
  // cases of the login feature, which run with the guard on.
  test.use({
    pageHealth: { off: 'the lane times page loads; page health belongs to the feature cases' },
  });

  test('the login page /', async ({ vitals }) => {
    await vitals.expectWithinBudget('/', {
      async load(page) {
        const login = new LoginPage(page);
        await login.open();
        await expect(login.username()).toBeVisible();
      },
      interact: (page) => new LoginPage(page).focusUsername(),
    });
  });
});
