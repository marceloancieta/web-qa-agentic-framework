import { expect, test } from '../fixtures';
import { CatalogPage } from '../pages/catalog-page';

test('the catalog opens @smoke', async ({ page }) => {
  const catalog = new CatalogPage(page);
  await catalog.open();
  await expect(catalog.heading()).toHaveText('Catalog');
});

test('a case without a layer', async ({ page }) => { // expect-finding: layer-tag
  await new CatalogPage(page).open();
});

test('a case with two layers @smoke @regression', async ({ page }) => { // expect-finding: layer-tag
  await new CatalogPage(page).open();
});

test('a misspelled tag @regresion', async ({ page }) => { // expect-finding: unknown-tag, layer-tag
  await new CatalogPage(page).open();
});

test('a tag in the details @sanity', { tag: ['@a11y', '@accesibility'] }, async ({ page }) => { // expect-finding: unknown-tag
  await new CatalogPage(page).open();
});

test.describe('search @regression', () => {
  test('inherits its layer from the describe @mocked', async ({ page }) => {
    await new CatalogPage(page).open();
  });
});

test('a total that is checked only sometimes @regression', async ({ page }) => {
  const catalog = new CatalogPage(page);
  await catalog.open();
  if (await catalog.empty().isVisible()) { // expect-finding: optional-assertion
    await expect(catalog.heading()).toHaveText('Catalog');
  }
});

test('both branches assert, so it is a discriminated check @regression', async ({ page }) => {
  const catalog = new CatalogPage(page);
  if (test.info().project.name.endsWith('mobile-chrome')) {
    await expect(catalog.heading()).toBeVisible();
  } else {
    await expect(catalog.empty()).toBeHidden();
  }
});

test('an assertion only when the open throws @regression', async ({ page }) => {
  try {
    await new CatalogPage(page).open();
  } catch (error) { // expect-finding: optional-assertion
    expect(String(error)).toContain('timeout');
  }
});

test('a soft check swallowed by the arm @regression @known-gap', async ({ page }) => {
  const catalog = new CatalogPage(page);
  await catalog.open();
  expect.soft(catalog.heading()).toBeTruthy(); // expect-finding: soft-before-arm
  test.fail(true, 'LOCAL-3: the total is wrong');
  await expect(catalog.anyTotal()).toHaveText('Total: 3');
});

test('a soft check after the arm is fine @regression @known-gap', async ({ page }) => {
  test.fail(true, 'LOCAL-4: the heading is wrong');
  const catalog = new CatalogPage(page);
  await catalog.open();
  expect.soft(catalog.heading()).toBeTruthy();
});
