// What the dashboard moves, with and without prefers-reduced-motion (registry/design.md,
// TC-DESIGN-08 to TC-DESIGN-11; ADR 0015). The preference is emulated per page; what moves is read
// from the transitions each element declares and the animations running (helpers/motion.ts). Only
// movement counts: a change of colour or opacity is not motion (WCAG 2.3.3). The dashboard and the
// orders page are read as the admin, once their content has its data; nothing is written.

import type { Locator, Page } from '@playwright/test';
import { animationsOf, motionOf, pageMotion, type Motion } from '../../../../helpers/motion';
import { PageFrame } from '../../components/page-frame';
import { UserMenu } from '../../components/user-menu';
import { ABORTED_FONT_DOWNLOAD, expect, test } from '../../fixtures';
import { holdReports } from '../../mocks/dashboard-mocks';
import { ForgotPasswordPage } from '../../pages/forgot-password-page';
import { LoginPage } from '../../pages/login-page';
import { openDashboard } from '../../pages/section-page';

// REQ-DESIGN-08: what the buttons and the user menu transition, and for how long. The buttons are
// those of the orders page's toolbar that every device shows (a narrow screen hides Export and
// Columns), as the TC-DESIGN-08 title names them.
const ORDERS_BUTTONS = ['Add filter', 'Sort'];
const PRESS = ['transform', 'translate', 'scale'];
const MENU_TRANSITION = 'opacity, transform, translate, scale';
const QUICK = '0.1s';

test.use({ pageHealth: { allowConsole: [ABORTED_FONT_DOWNLOAD] } });

const prefer = (page: Page, reducedMotion: 'reduce' | 'no-preference') =>
  page.emulateMedia({ reducedMotion });
const pulses = (running: Motion[]) => running.filter(({ name }) => name === 'pulse');

test('TC-DESIGN-08 without a motion preference, the buttons Add filter and Sort of the orders page transition transform, translate and scale over 0.1 s, and the open user menu opacity, transform, translate and scale over 0.1 s @regression', async ({
  admin,
}) => {
  await prefer(admin.page, 'no-preference');
  const dashboard = await openDashboard(admin.page);
  expect(await dashboard.openAndWaitForList('orders', ['orders'])).toBe(200);

  for (const name of ORDERS_BUTTONS) {
    const [press, ...more] = await motionOf(dashboard.control(name));
    expect(more, name).toEqual([]);
    expect(press?.properties, name).toEqual(PRESS);
    expect(press?.durationMs, name).toBe(100);
  }

  const menu = new UserMenu(admin.page);
  await menu.open();
  await expect(menu.menu()).toHaveCSS('transition-property', MENU_TRANSITION);
  await expect(menu.menu()).toHaveCSS('transition-duration', QUICK);
});

test('TC-DESIGN-09 the motion of the sign-in, the forgot-password page, the dashboard, the orders page and the open user menu, present without a preference, is gone with prefers-reduced-motion: reduce, and the menu still fades in through opacity @regression @a11y', async ({
  page,
  admin,
}) => {
  // Four pages and a menu, each read twice: past 30 s on the WebKit projects.
  test.slow();
  /** What `target` holds moves without the preference, and nothing moves with it. */
  const stopsMoving = async (on: Page, target: Locator, name: string) => {
    await prefer(on, 'no-preference');
    expect((await motionOf(target, { subtree: true })).length, `${name} moves`).toBeGreaterThan(0);

    await prefer(on, 'reduce');

    expect(await motionOf(target, { subtree: true }), `${name} with reduce`).toEqual([]);
  };

  await new LoginPage(page).open();
  await stopsMoving(page, new PageFrame(page).body(), 'sign-in');
  await new ForgotPasswordPage(page).open();
  await stopsMoving(page, new PageFrame(page).body(), 'forgot');

  // Read once the content has its data: a widget or a row drawn later is part of the page too.
  const dashboard = await openDashboard(admin.page);
  await dashboard.openHomeAndWaitForReports();
  await stopsMoving(admin.page, new PageFrame(admin.page).body(), 'dashboard');
  expect(await dashboard.openAndWaitForList('orders', ['orders'])).toBe(200);
  await stopsMoving(admin.page, new PageFrame(admin.page).body(), 'orders');

  const menu = new UserMenu(admin.page);
  await prefer(admin.page, 'no-preference');
  await menu.open();
  await stopsMoving(admin.page, menu.menu(), 'user menu');
  // With the preference the menu fades: the stylesheet's reduce rule keeps an opacity transition
  // of 0.1 s on it (REQ-DESIGN-09). The fade drawn on screen is not measured.
  await expect(menu.menu()).toHaveCSS('transition-property', /(^|, )opacity(,|$)/);
  await expect(menu.menu()).toHaveCSS('transition-duration', QUICK);
});

test("TC-DESIGN-10 with the dashboard's reports held back, its loading placeholders pulse without a preference, and with prefers-reduced-motion: reduce none pulses and nothing on the page moves @regression @perf @a11y @mocked", async ({
  admin,
}) => {
  const reports = await holdReports(admin.page);
  await prefer(admin.page, 'no-preference');
  const dashboard = await openDashboard(admin.page);
  await expect(dashboard.contentPlaceholders().first()).toBeVisible();
  expect(
    pulses(await animationsOf(dashboard.main(), { subtree: true })).length,
    'pulsing without the preference',
  ).toBeGreaterThan(0);

  await prefer(admin.page, 'reduce');

  // Still loading: the content keeps placeholders, held by the reports, and none of them pulses.
  // A widget fed by another request may finish meanwhile, so their number can drop.
  await expect(dashboard.contentPlaceholders().first()).toBeVisible();
  expect(pulses(await animationsOf(dashboard.main(), { subtree: true })), 'pulsing').toEqual([]);
  expect(await pageMotion(admin.page), 'moving').toEqual([]);

  // The real answers end the loading, so no request is left open when the case ends.
  reports.release();
  await expect(dashboard.contentPlaceholders()).toHaveCount(0, { timeout: 15_000 });
});

test('TC-DESIGN-11 with prefers-reduced-motion: reduce, once the dashboard and the orders page have loaded with their real data, no running animation moves anything and none repeats @regression @a11y', async ({
  admin,
}) => {
  await prefer(admin.page, 'reduce');
  const dashboard = await openDashboard(admin.page);
  const settled = async (name: string) => {
    expect(await pageMotion(admin.page), `${name}: moving`).toEqual([]);
    const repeating = (
      await animationsOf(new PageFrame(admin.page).body(), { subtree: true })
    ).filter(({ iterations }) => iterations > 1);
    expect(repeating, `${name}: repeating`).toEqual([]);
  };

  await dashboard.openHomeAndWaitForReports();
  await settled('dashboard');

  expect(await dashboard.openAndWaitForList('orders', ['orders'])).toBe(200);
  await expect(dashboard.contentPlaceholders()).toHaveCount(0, { timeout: 15_000 });
  await settled('orders');
});
