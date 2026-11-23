// Visual: what a staff role sees, on every device project, compared with baselines rendered in the
// pinned image (npm run lanes:visual). Every other run leaves this file's cases out.
//
// The sidebar is compared without the dashboard beside it, which holds charts, a date range and
// counts that change with every run: below the breakpoint the dialog alone, from it up the page with
// the dashboard masked (the sidebar's page object chooses). The roles' members are the provisioned actors of the pack (made through the
// admin API once per worker and removed at the end); TC-ROLES-18 makes a member of its own and
// removes it from the store before it signs in. Members' names and addresses are made per run, so
// the page objects mask them.

import { StaffApi } from '../../api/staff-api';
import { Sidebar } from '../../components/sidebar';
import { ABORTED_FONT_DOWNLOAD, expect, provisionedIds, test, type Actor } from '../../fixtures';
import { LoginPage } from '../../pages/login-page';
import { NoStorePage } from '../../pages/no-store-page';
import { openDashboard } from '../../pages/section-page';

const REMOVED = 204;
// A sign-in answer took up to a few seconds on a local container busy with parallel workers.
const ANSWER = { timeout: 15_000 };

test.use({ pageHealth: { allowConsole: [ABORTED_FONT_DOWNLOAD] } });

test.beforeEach(({ qa }) => {
  test.skip(!qa.allowWrites, 'the cases create roles and staff members; allow_writes is false');
});

/** Open `member`'s dashboard and its sidebar, once the role's sections and the user menu are drawn. */
async function openSidebar(
  member: Actor,
  app: Parameters<typeof Sidebar.for>[1],
  sections: readonly string[],
): Promise<Sidebar> {
  await openDashboard(member.page);
  const sidebar = Sidebar.for(member.page, app);
  await sidebar.open();
  for (const name of sections) await expect(sidebar.section(name), name).toBeVisible();
  return sidebar;
}

test('TC-ROLES-16 the orders-reader\'s sidebar looks as designed, with Home and Orders only, opened through "Toggle Sidebar" where the device hides it, and the member\'s name masked @regression @visual @layout', async ({
  ordersReader,
  app,
  visual,
}) => {
  const sidebar = await openSidebar(ordersReader, app, ['Home', 'Orders']);

  await visual.expectToMatch(
    sidebar.screenshotTarget(),
    'sidebar-orders-reader.png',
    sidebar.masks(),
  );
});

test('TC-ROLES-17 the catalog-editor\'s sidebar looks as designed, with Home, Products and Settings only, opened through "Toggle Sidebar" where the device hides it, and the member\'s name masked @regression @visual @layout', async ({
  catalogEditor,
  app,
  visual,
}) => {
  const sidebar = await openSidebar(catalogEditor, app, ['Home', 'Products', 'Settings']);

  await visual.expectToMatch(
    sidebar.screenshotTarget(),
    'sidebar-catalog-editor.png',
    sidebar.masks(),
  );
});

test('TC-ROLES-18 the page a member removed from the store reaches after signing in looks as designed: "You don\'t have access to any store" and no store data, with the member\'s name masked @regression @visual @layout', async ({
  admin,
  actor,
  page,
  visual,
}) => {
  const member = await actor('orders-reader', { fresh: true });
  const { memberId } = provisionedIds(member.account);
  const account = member.account!;
  expect(await new StaffApi(admin.api).removeMember(memberId)).toBe(REMOVED);
  const login = new LoginPage(page);
  await login.open();

  await login.signIn(account.username, account.password);

  const noStore = new NoStorePage(page);
  await expect(noStore.heading()).toBeVisible(ANSWER);
  await expect(noStore.signedInAs()).toBeVisible();
  await expect(noStore.text('#R1001')).toHaveCount(0);
  await visual.expectToMatch(page, 'no-store.png', noStore.masks(), { wholePage: true });
});
