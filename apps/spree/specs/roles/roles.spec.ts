// What each staff role sees in the Spree admin dashboard (registry/roles.md). The `orders-reader`
// (`read_orders`) and the `catalog-editor` (`read_products`, `write_products`) are members the
// admin provisions once per worker through the API and removes at the end; a case that removes a
// member or a role makes its own (`fresh`). Every role starts signed in through the API.
//
// A section a role cannot read still opens by its address, over an empty table (LOCAL-48): a case
// waits for the answer to the section's list before it reads the table, since an empty table is
// also what a loading one looks like.

import { pageOverflow, unloadedImages } from '../../../../helpers/layout';
import { loadDecisionTable } from '../../../../scripts/lib/decision-table.mjs';
import { knownGap } from '../../../../helpers/case-meta';
import { CatalogApi } from '../../api/catalog-api';
import { StaffApi, type Section } from '../../api/staff-api';
import { roleName } from '../../builders/staff-builder';
import { Sidebar } from '../../components/sidebar';
import { expect, provisionedIds, test, type Actor } from '../../fixtures';
import { LoginPage } from '../../pages/login-page';
import { NoStorePage } from '../../pages/no-store-page';
import { SettingsPage } from '../../pages/settings-page';
import { openDashboard } from '../../pages/section-page';

// The answers of the admin API (REQ-ROLES-05).
const ALLOWED = 200;
const REFUSED = 403;
const ANSWER = { timeout: 15_000 };
// The list that fills each section's table (contract, network dependencies).
const LISTS: Record<string, readonly string[]> = {
  orders: ['orders'],
  products: ['products'],
  customers: ['customers'],
  'settings/staff': ['admin_users'],
  'settings/roles': ['roles'],
};
// Every section of the admin's sidebar, in its order (REQ-ROLES-01, the TC-ROLES-01 title).
const ALL_SECTIONS = [
  'Home',
  'Orders',
  'Products',
  'Inventory',
  'Customers',
  'Companies',
  'Sellers',
  'Loyalty',
  'Promotions',
  'Reports',
  'Settings',
] as const;

test.beforeEach(({ qa }) => {
  test.skip(!qa.allowWrites, 'the cases create roles and staff members; allow_writes is false');
});

/** The sidebar of `member`'s dashboard holds exactly `expected` among the admin's sections. */
async function expectSidebar(
  member: Actor,
  app: Parameters<typeof Sidebar.for>[1],
  expected: readonly string[],
) {
  await openDashboard(member.page);
  const sidebar = Sidebar.for(member.page, app);
  await sidebar.open();
  // The role's own sections first, so the absences are read from a sidebar that has drawn them.
  for (const name of expected) await expect(sidebar.section(name), name).toHaveCount(1);
  for (const name of ALL_SECTIONS.filter((section) => !expected.includes(section))) {
    await expect(sidebar.section(name), name).toHaveCount(0);
  }
}

test("TC-ROLES-01 the admin's sidebar holds Home, Orders, Products, Inventory, Customers, Companies, Sellers, Loyalty, Promotions, Reports and Settings @regression @navigation", async ({
  admin,
  app,
}) => {
  await expectSidebar(admin, app, ALL_SECTIONS);
});

test('TC-ROLES-02 the orders-reader\'s sidebar holds Home and Orders and no other section, behind "Toggle Sidebar" where the device hides it @regression @security @responsive', async ({
  ordersReader,
  app,
}) => {
  await expectSidebar(ordersReader, app, ['Home', 'Orders']);
});

test('TC-ROLES-03 the catalog-editor\'s sidebar holds Home, Products and Settings and no other section, behind "Toggle Sidebar" where the device hides it @regression @security @responsive', async ({
  catalogEditor,
  app,
}) => {
  await expectSidebar(catalogEditor, app, ['Home', 'Products', 'Settings']);
});

test("TC-ROLES-04 the orders-reader's Orders lists the orders #R1001 and #R1002 of the sample data @smoke", async ({
  ordersReader,
}) => {
  const dashboard = await openDashboard(ordersReader.page);

  expect(await dashboard.openAndWaitForList('orders', LISTS['orders']!)).toBe(ALLOWED);

  await expect(dashboard.heading('Orders')).toBeVisible();
  await expect(dashboard.record('#R1001')).toBeVisible();
  await expect(dashboard.record('#R1002')).toBeVisible();
});

test('TC-ROLES-05 the catalog-editor\'s Products lists <PRODUCT> and offers "Add product" @regression', async ({
  catalogEditor,
}) => {
  // <PRODUCT>: whichever product of the sample data the list shows first; the list's order drifts.
  const names = await new CatalogApi(catalogEditor.api).productNames();
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const anyProduct = new RegExp(escaped.join('|'));
  const dashboard = await openDashboard(catalogEditor.page);

  expect(await dashboard.openAndWaitForList('products', LISTS['products']!)).toBe(ALLOWED);

  await expect(dashboard.heading('Products')).toBeVisible();
  await expect(dashboard.records().first()).toContainText(anyProduct);
  await expect(dashboard.control('Add product')).toBeVisible();
});

test('TC-ROLES-06 a section opened by its address that the role cannot read shows none of its rows once its refused request has answered: the orders-reader on Products, Customers, Staff and Roles; the catalog-editor on Orders and Customers @regression @security @navigation', async ({
  ordersReader,
  catalogEditor,
}) => {
  // Six sections, each opened and answered: longer than one page's case.
  test.slow();
  const refused: [Actor, string, string][] = [
    [ordersReader, 'products', 'Products'],
    [ordersReader, 'customers', 'Customers'],
    // Roles before Staff: the Staff page also asks for `roles`, which would answer a wait the next
    // step set up; the Roles page asks for nothing the Staff step waits for.
    [ordersReader, 'settings/roles', 'Roles'],
    [ordersReader, 'settings/staff', 'Staff'],
    [catalogEditor, 'orders', 'Orders'],
    [catalogEditor, 'customers', 'Customers'],
  ];
  const dashboards = new Map([
    [ordersReader, await openDashboard(ordersReader.page)],
    [catalogEditor, await openDashboard(catalogEditor.page)],
  ]);
  for (const [member, path, heading] of refused) {
    await test.step(`the ${member.role} on ${path}: refused, no rows`, async () => {
      const dashboard = dashboards.get(member)!;
      expect(await dashboard.openAndWaitForList(path, LISTS[path]!)).toBe(REFUSED);
      await expect(dashboard.heading(heading)).toBeVisible();
      await expect(dashboard.records()).toHaveCount(0);
    });
  }
});

test('TC-ROLES-07 the admin API answers each role by the table `rules/TC-ROLES-07.yaml`: 200 for the sections the role reads, 403 for the rest @regression @security', async ({
  admin,
  ordersReader,
  catalogEditor,
}) => {
  const members: Record<string, Actor> = {
    admin,
    orders_reader: ordersReader,
    catalog_editor: catalogEditor,
  };
  for (const { when, then } of loadDecisionTable('apps/spree/rules/TC-ROLES-07.yaml')) {
    const role = when['role'] as string;
    const section = when['section'] as Section;
    await test.step(`${role} lists ${section}: ${then['api']}`, async () => {
      const member = members[role];
      if (!member) throw new Error(`rules/TC-ROLES-07.yaml names an unknown role: ${role}`);
      const expected = then['api'] === 'allowed' ? ALLOWED : REFUSED;
      expect(await new StaffApi(member.api).listStatus(section)).toBe(expected);
    });
  }
});

test('TC-ROLES-08 the catalog-editor\'s settings list holds "Imports" only, and the orders-reader has no Settings link @regression @security', async ({
  ordersReader,
  catalogEditor,
  app,
}) => {
  await test.step("the catalog-editor's settings: Imports alone", async () => {
    const { storeId } = await openDashboard(catalogEditor.page);
    const settings = SettingsPage.for(catalogEditor.page, storeId, app);
    await settings.open();
    await expect(settings.heading()).toBeVisible();
    // One card on every device, named by the setting and its description, and one entry in the
    // navigation where it is shown, named by the setting.
    await expect(settings.cards()).toHaveCount(1);
    await expect(settings.cards()).toHaveAccessibleName(/^Imports(\s|$)/);
    await expect(settings.navigationEntries()).toHaveCount(1);
    await expect(settings.navigationEntries()).toHaveAccessibleName(/^Imports(\s|$)/);
  });
  await test.step('the orders-reader: no Settings link', async () => {
    await openDashboard(ordersReader.page);
    const sidebar = Sidebar.for(ordersReader.page, app);
    await sidebar.open();
    await expect(sidebar.section('Home')).toBeVisible();
    await expect(sidebar.section('Orders')).toBeVisible();
    await expect(sidebar.section('Settings')).toHaveCount(0);
  });
});

test('TC-ROLES-09 the admin\'s Staff lists the members with "Invite teammate", and Roles lists the roles with "Add role", the case\'s roles among them @regression', async ({
  admin,
  ordersReader,
  catalogEditor,
}) => {
  const members = [ordersReader.account, catalogEditor.account];
  if (members.some((account) => !account)) throw new Error('Both members have accounts.');
  const dashboard = await openDashboard(admin.page);

  await test.step('Staff: both members among the members, and "Invite teammate"', async () => {
    expect(await dashboard.openAndWaitForList('settings/staff', ['admin_users'])).toBe(ALLOWED);
    await expect(dashboard.heading('Staff')).toBeVisible();
    await expect(dashboard.control('Invite teammate')).toBeVisible();
    for (const account of members) await expect(dashboard.record(account!.username)).toBeVisible();
  });
  await test.step('Roles: both members\' roles among the roles, and "Add role"', async () => {
    expect(await dashboard.openAndWaitForList('settings/roles', ['roles'])).toBe(ALLOWED);
    await expect(dashboard.heading('Roles')).toBeVisible();
    await expect(dashboard.control('Add role')).toBeVisible();
    for (const account of members) await expect(dashboard.record(roleName(account!))).toBeVisible();
  });
});

test('TC-ROLES-10 a staff member the admin removed from the store signs in through the form and reaches no store: the page says "You don\'t have access to any store" and shows no orders @regression @security', async ({
  admin,
  actor,
  page,
}) => {
  const member = await actor('orders-reader', { fresh: true });
  const { memberId } = provisionedIds(member.account);
  const account = member.account!;
  expect(await new StaffApi(admin.api).removeMember(memberId)).toBe(204);
  const login = new LoginPage(page);
  await login.open();

  await login.signIn(account.username, account.password);

  const noStore = new NoStorePage(page);
  await expect(noStore.heading()).toBeVisible(ANSWER);
  await expect(noStore.text('#R1001')).toHaveCount(0);
  // The account itself still authenticates: what it lost is the store.
  expect(await new StaffApi(member.api).listStatus('orders')).toBe(REFUSED);
});

test('TC-ROLES-11 a role still held by a member cannot be removed, and can be once the member is removed @regression', async ({
  admin,
  actor,
}) => {
  const member = await actor('orders-reader', { fresh: true });
  const { memberId, roleId } = provisionedIds(member.account);
  const staff = new StaffApi(admin.api);

  await test.step('the role a member holds is refused', async () => {
    // A refusal the server handled: a client error, not a crash.
    const status = await staff.removeRole(roleId);
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });
  await test.step('once the member is removed, the role is removed', async () => {
    expect(await staff.removeMember(memberId)).toBe(204);
    expect(await staff.removeRole(roleId)).toBe(204);
  });
});

// TC-ROLES-12: the admin API answers refused to the orders-reader on Orders and on Products, as
// observed on desktop Chromium and Pixel 7 (2026-11-14). The refused Products page always gets the
// first four; the reports and channels the pages read are refused too when they ask in time.
// Nothing outside this list may be refused.
const REFUSED_ALWAYS = [
  'GET /api/v3/admin/custom_field_definitions 403',
  'GET /api/v3/admin/dashboard/counters 403',
  'GET /api/v3/admin/markets 403',
  'GET /api/v3/admin/products 403',
];
const REFUSED_AT_MOST = [
  ...REFUSED_ALWAYS,
  'GET /api/v3/admin/channels 403',
  'GET /api/v3/admin/reporting/schema 403',
  'POST /api/v3/admin/reporting/query 403',
];

test("TC-ROLES-12 the orders-reader's dashboard and Orders load with no broken image, failed request, console error or uncaught exception, and a refused section only fails its own refused requests @regression @layout", async ({
  ordersReader,
}) => {
  // The page health guard checks the requests, the console and the exceptions when the case ends;
  // it leaves answers below 500 alone, so the refused section's 4xx answers are read here.
  const dashboard = await openDashboard(ordersReader.page);
  await expect(dashboard.heading('Dashboard')).toBeVisible();
  await expect.poll(() => unloadedImages(dashboard.images()), { message: 'home' }).toEqual([]);
  // Orders and the refused Products are refused exactly what the role cannot read (the products
  // list, and what the pages also read: custom fields, markets, the sidebar's counters;
  // docs/app-notes.md), and nothing else: a refused session, member or store fails the case.
  const refusals = dashboard.watchRefusals();
  expect(await dashboard.openAndWaitForList('orders', LISTS['orders']!)).toBe(ALLOWED);
  await expect(dashboard.record('#R1001')).toBeVisible();
  await expect.poll(() => unloadedImages(dashboard.images()), { message: 'Orders' }).toEqual([]);

  expect(await dashboard.openAndWaitForList('products', LISTS['products']!)).toBe(REFUSED);
  await expect(dashboard.heading('Products')).toBeVisible();
  await expect.poll(() => unloadedImages(dashboard.images()), { message: 'Products' }).toEqual([]);
  // Every refusal the section always gets has arrived, then none outside the known ones.
  await expect
    .poll(() => refusals.seen(), { message: 'the refusals Products always gets' })
    .toEqual(expect.arrayContaining(REFUSED_ALWAYS));
  expect(
    refusals.seen().filter((answer) => !REFUSED_AT_MOST.includes(answer)),
    'refused answers outside what the role cannot read',
  ).toEqual([]);
});

test('TC-ROLES-13 Orders and a refused section have no horizontal scroll for the orders-reader @regression @responsive', async ({
  ordersReader,
}) => {
  const { page } = ordersReader;
  const dashboard = await openDashboard(page);
  expect(await dashboard.openAndWaitForList('orders', LISTS['orders']!)).toBe(ALLOWED);
  await expect(dashboard.record('#R1001')).toBeVisible();
  // The page, not the orders table, which scrolls inside a container of its own on narrow screens.
  await expect.poll(() => pageOverflow(dashboard.main()), { message: 'Orders' }).toBe(0);

  expect(await dashboard.openAndWaitForList('products', LISTS['products']!)).toBe(REFUSED);
  await expect(dashboard.heading('Products')).toBeVisible();
  await expect.poll(() => pageOverflow(dashboard.main()), { message: 'refused Products' }).toBe(0);
});

test('TC-ROLES-14 a role without the write permission is offered no write control: the orders-reader sees no "New Order" on Orders, while the catalog-editor sees "Add product" on Products @regression @navigation @known-gap', async ({
  ordersReader,
  catalogEditor,
}) => {
  const editor = await openDashboard(catalogEditor.page);
  expect(await editor.openAndWaitForList('products', LISTS['products']!)).toBe(ALLOWED);
  await expect(editor.control('Add product')).toBeVisible();
  const reader = await openDashboard(ordersReader.page);
  expect(await reader.openAndWaitForList('orders', LISTS['orders']!)).toBe(ALLOWED);
  await expect(reader.record('#R1001')).toBeVisible();
  test.fail(
    true,
    await knownGap('LOCAL-47', 'the dashboard shows write controls whatever the role'),
  );

  await expect(reader.control('New Order')).toHaveCount(0);
});

test('TC-ROLES-15 a section the role cannot read, opened by its address, says that access is refused instead of showing an empty table @regression @navigation @known-gap', async ({
  ordersReader,
}) => {
  const dashboard = await openDashboard(ordersReader.page);
  expect(await dashboard.openAndWaitForList('products', LISTS['products']!)).toBe(REFUSED);
  await expect(dashboard.heading('Products')).toBeVisible();
  test.fail(
    true,
    await knownGap('LOCAL-48', 'a refused section shows an empty table and no message'),
  );

  await expect(dashboard.accessRefused()).toBeVisible();
});
