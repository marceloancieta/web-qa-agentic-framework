// The dashboard's components drawn with its design system (registry/design.md, TC-DESIGN-01 to
// TC-DESIGN-07 and TC-DESIGN-12). The expected values are the tokens of design-tokens.json, written
// from the stylesheet's own variables at intake (ADR 0015); which property takes which token is
// each case's expected result, never read from the page. The sign-in and the forgot-password page
// are read signed out; the dashboard's home and the orders page as the admin. Nothing is written.

import { join } from 'node:path';
import type { Locator } from '@playwright/test';
import { loadDesignTokens, tokenMismatches } from '../../../../helpers/design-tokens';
import { PageFrame } from '../../components/page-frame';
import { ABORTED_FONT_DOWNLOAD, expect, test } from '../../fixtures';
import { ForgotPasswordPage } from '../../pages/forgot-password-page';
import { LoginPage } from '../../pages/login-page';
import { openDashboard } from '../../pages/section-page';

const TOKENS = loadDesignTokens(join(__dirname, '..', '..', 'design-tokens.json'));

// What each kind of component is drawn with (the registry titles).
const PAGE = {
  'background-color': 'color.background',
  color: 'color.foreground',
  'font-family': 'font.family.sans',
  'font-size': 'font.size.base',
} as const;
const HEADING = {
  color: 'color.foreground',
  'font-family': 'font.family.sans',
  'font-size': 'font.size.2xl',
  'font-weight': 'font.weight.bold',
} as const;
// Its size depends on the width (TC-DESIGN-12).
const SECTION_HEADING = {
  color: 'color.foreground',
  'font-family': 'font.family.sans',
  'font-weight': 'font.weight.semibold',
} as const;
const PRIMARY_BUTTON = {
  'background-color': 'color.primary',
  color: 'color.primary-foreground',
  'border-top-left-radius': 'radius.lg',
  'border-bottom-right-radius': 'radius.lg',
  'font-family': 'font.family.sans',
  'font-size': 'font.size.sm',
  'font-weight': 'font.weight.medium',
} as const;
const FIELD_AT_REST = {
  'background-color': 'color.card',
  color: 'color.foreground',
  'border-top-color': 'color.border',
  'border-bottom-color': 'color.border',
  'border-top-left-radius': 'radius.md',
  'border-bottom-right-radius': 'radius.md',
  'font-weight': 'font.weight.normal',
} as const;
const LABEL = {
  color: 'color.foreground',
  'font-size': 'font.size.sm',
  'font-weight': 'font.weight.medium',
} as const;
const LINK_AT_REST = { color: 'color.link', 'font-size': 'font.size.sm' } as const;
const LINK_HOVERED = { color: 'color.link-hover' } as const;

test.use({ pageHealth: { allowConsole: [ABORTED_FONT_DOWNLOAD] } });

/**
 * A border colour is computed even where no border is drawn, so a field's border colour counts
 * only with a width: the top and the bottom are not 0px.
 */
async function expectDrawnBorder(field: Locator): Promise<void> {
  await expect(field).not.toHaveCSS('border-top-width', '0px');
  await expect(field).not.toHaveCSS('border-bottom-width', '0px');
}

test('TC-DESIGN-01 the sign-in, the forgot-password page and the dashboard are drawn on color.background, with text in color.foreground, font.family.sans and font.size.base @regression @layout', async ({
  page,
  admin,
}) => {
  const login = new LoginPage(page);
  await login.open();
  expect(await tokenMismatches(new PageFrame(page).body(), PAGE, TOKENS), 'sign-in').toEqual([]);

  await new ForgotPasswordPage(page).open();
  expect(await tokenMismatches(new PageFrame(page).body(), PAGE, TOKENS), 'forgot').toEqual([]);

  const dashboard = await openDashboard(admin.page);
  await expect(dashboard.heading('Dashboard')).toBeVisible();
  expect(
    await tokenMismatches(new PageFrame(admin.page).body(), PAGE, TOKENS),
    'dashboard',
  ).toEqual([]);
});

test("TC-DESIGN-02 the level-1 heading of the sign-in, of the forgot-password page and of the dashboard's home is in color.foreground, font.family.sans, font.size.2xl and font.weight.bold @regression @layout", async ({
  page,
  admin,
}) => {
  const login = new LoginPage(page);
  await login.open();
  expect(await tokenMismatches(login.heading(), HEADING, TOKENS), 'sign-in').toEqual([]);

  const forgot = new ForgotPasswordPage(page);
  await forgot.open();
  expect(await tokenMismatches(forgot.heading(), HEADING, TOKENS), 'forgot').toEqual([]);

  const dashboard = await openDashboard(admin.page);
  expect(
    await tokenMismatches(dashboard.heading('Dashboard'), HEADING, TOKENS),
    'dashboard',
  ).toEqual([]);
});

test("TC-DESIGN-12 the level-1 heading of the orders page is in color.foreground, font.family.sans and font.weight.semibold, at font.size.2xl where the project's viewport is 640 px wide or more and font.size.xl where it is narrower @regression @layout @responsive", async ({
  admin,
  app,
}) => {
  // The partition comes from the project's viewport and app.json, not from the page's media query.
  const from = app.breakpoints?.['section_heading'];
  if (from === undefined) throw new Error('app.json has no breakpoints.section_heading.');
  const wide = (admin.page.viewportSize()?.width ?? 0) >= from;
  const dashboard = await openDashboard(admin.page);
  await dashboard.open('orders');

  expect(
    await tokenMismatches(
      dashboard.heading('Orders'),
      { ...SECTION_HEADING, 'font-size': wide ? 'font.size.2xl' : 'font.size.xl' },
      TOKENS,
    ),
    wide ? 'from the breakpoint' : 'below the breakpoint',
  ).toEqual([]);
});

test('TC-DESIGN-03 "Sign in" and "Send reset link" are drawn with a color.primary background, color.primary-foreground text, radius.lg corners, font.family.sans, font.size.sm and font.weight.medium @regression @layout', async ({
  page,
}) => {
  const login = new LoginPage(page);
  await login.open();
  expect(await tokenMismatches(login.submit(), PRIMARY_BUTTON, TOKENS), 'Sign in').toEqual([]);

  const forgot = new ForgotPasswordPage(page);
  await forgot.open();
  expect(await tokenMismatches(forgot.send(), PRIMARY_BUTTON, TOKENS), 'Send reset link').toEqual(
    [],
  );
});

test('TC-DESIGN-04 once the focus leaves it, Email on the sign-in and on the forgot-password page has a color.card background, color.foreground text, a color.border border, radius.md corners and font.weight.normal, and its label is color.foreground, font.size.sm and font.weight.medium @regression @layout', async ({
  page,
}) => {
  const login = new LoginPage(page);
  await login.open();
  // Both pages give Email the focus as they open (REQ-LOGIN-10, REQ-PWRESET-01).
  await login.email().blur();
  expect(await tokenMismatches(login.email(), FIELD_AT_REST, TOKENS), 'sign-in Email').toEqual([]);
  await expectDrawnBorder(login.email());
  expect(await tokenMismatches(login.emailLabel(), LABEL, TOKENS), 'sign-in label').toEqual([]);

  const forgot = new ForgotPasswordPage(page);
  await forgot.open();
  await forgot.email().blur();
  expect(await tokenMismatches(forgot.email(), FIELD_AT_REST, TOKENS), 'forgot Email').toEqual([]);
  await expectDrawnBorder(forgot.email());
  expect(await tokenMismatches(forgot.emailLabel(), LABEL, TOKENS), 'forgot label').toEqual([]);
});

test("TC-DESIGN-05 Email's border is color.border at rest and turns color.ring with the focus, on the sign-in and on the forgot-password page @regression @navigation", async ({
  page,
}) => {
  const login = new LoginPage(page);
  const forgot = new ForgotPasswordPage(page);
  for (const [name, open, email] of [
    ['sign-in', () => login.open(), login.email()],
    ['forgot', () => forgot.open(), forgot.email()],
  ] as const) {
    await open();
    await email.blur();
    expect(
      await tokenMismatches(email, { 'border-top-color': 'color.border' }, TOKENS),
      `${name} at rest`,
    ).toEqual([]);
    await expectDrawnBorder(email);

    await email.focus();

    expect(
      await tokenMismatches(email, { 'border-top-color': 'color.ring' }, TOKENS),
      `${name} focused`,
    ).toEqual([]);
    await expectDrawnBorder(email);
  }
});

test('TC-DESIGN-06 Email\'s text is font.size.touch-control on the touch projects (tablet, mobile) and font.size.base on the desktop projects, while "Sign in" stays font.size.sm on both @regression @responsive', async ({
  page,
}, testInfo) => {
  // The partition comes from the device project, not from the page's own media query.
  const touch = testInfo.project.metadata['formFactor'] !== 'desktop';
  const login = new LoginPage(page);
  await login.open();

  expect(
    await tokenMismatches(
      login.email(),
      { 'font-size': touch ? 'font.size.touch-control' : 'font.size.base' },
      TOKENS,
    ),
    touch ? 'touch' : 'desktop',
  ).toEqual([]);
  expect(await tokenMismatches(login.submit(), { 'font-size': 'font.size.sm' }, TOKENS)).toEqual(
    [],
  );
});

test('TC-DESIGN-07 "Forgot password?" and "Back to sign in" are color.link and font.size.sm at rest, and under the pointer turn color.link-hover and underlined @regression @layout @navigation', async ({
  page,
}) => {
  const login = new LoginPage(page);
  const forgot = new ForgotPasswordPage(page);
  for (const [name, open, link] of [
    ['Forgot password?', () => login.open(), login.forgotPassword()],
    ['Back to sign in', () => forgot.open(), forgot.backToSignIn()],
  ] as const) {
    await open();
    expect(await tokenMismatches(link, LINK_AT_REST, TOKENS), `${name} at rest`).toEqual([]);
    await expect(link, `${name} at rest`).toHaveCSS('text-decoration-line', 'none');

    await link.hover();

    expect(await tokenMismatches(link, LINK_HOVERED, TOKENS), `${name} hovered`).toEqual([]);
    await expect(link, `${name} hovered`).toHaveCSS('text-decoration-line', 'underline');
  }
});
