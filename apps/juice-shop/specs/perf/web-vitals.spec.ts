// Web vitals (`@web-vitals`, selected only by the web vitals lane, on one worker): LCP, CLS and INP
// of the pages a visitor lands on, against the budget qa-config gives the pack in the environment
// (`performance.web_vitals`). Not registry cases, so the titles carry no case id. Each test visits
// its page several times, each time in a new anonymous context, and judges the medians; the
// interaction INP needs opens the side navigation, which changes no data. Engines without the
// entry types (Firefox, WebKit) skip with the reason.

import { LoginPage } from '../../pages/login-page';
import { SearchPage } from '../../pages/search-page';
import { Toolbar } from '../../components/toolbar';
import { expect, test } from '../../fixtures';

test.describe('web vitals', { tag: ['@regression', '@web-vitals'] }, () => {
  // The subject is how fast the page is. What the page health guard finds on these pages belongs
  // to the cases of their features, which run with the guard on.
  test.use({
    pageHealth: { off: 'the lane times page loads; page health belongs to the feature cases' },
  });

  test('the product list /#/search', async ({ vitals }) => {
    await vitals.expectWithinBudget('/#/search', {
      async load(page) {
        const search = new SearchPage(page);
        await search.open();
        await expect(search.products().first()).toBeVisible();
      },
      interact: (page) => new Toolbar(page).openSideNav(),
    });
  });

  test('the login page /#/login', async ({ vitals }) => {
    await vitals.expectWithinBudget('/#/login', {
      async load(page) {
        const login = new LoginPage(page);
        await login.open();
        await expect(login.email()).toBeVisible();
      },
      interact: (page) => new Toolbar(page).openSideNav(),
    });
  });
});
