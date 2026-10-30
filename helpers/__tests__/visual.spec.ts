import { expect, test } from '@playwright/test';
import { fitViewportToContent } from '../visual';

// A shell whose content scrolls inside a box of the viewport's height, as a sidenav layout does.
const INNER = `<!doctype html><html lang="en"><head><title>Inner</title><style>
  html, body { margin: 0; height: 100%; overflow: hidden; }
  #content { height: 100%; overflow: auto; }
  .item { height: 300px; }
</style></head><body><div id="content">
  ${'<div class="item">item</div>'.repeat(10)}
</div></body></html>`;

// A page whose document scrolls.
const DOCUMENT = `<!doctype html><html lang="en"><head><title>Document</title><style>
  body { margin: 0; } .item { height: 250px; }
</style></head><body>${'<div class="item">item</div>'.repeat(8)}</body></html>`;

test('the viewport grows until the inner scrolling box hides nothing, then comes back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.setContent(INNER);
  const restore = await fitViewportToContent(page);
  expect(page.viewportSize()).toEqual({ width: 800, height: 3000 });
  const box = page.locator('#content');
  expect(await box.evaluate((e) => e.scrollHeight - e.clientHeight)).toBe(0);
  await restore();
  expect(page.viewportSize()).toEqual({ width: 800, height: 600 });
});

test('a document that scrolls is grown the same way, and a page that fits is left alone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.setContent(DOCUMENT);
  const restore = await fitViewportToContent(page);
  expect(page.viewportSize()).toEqual({ width: 800, height: 2000 });
  await restore();

  await page.setContent('<!doctype html><html lang="en"><title>Short</title><p>short</p></html>');
  await fitViewportToContent(page);
  expect(page.viewportSize()).toEqual({ width: 800, height: 600 });
});

test('the growth stops at the ceiling', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.setContent(INNER);
  await fitViewportToContent(page, 1000);
  expect(page.viewportSize()).toEqual({ width: 800, height: 1000 });
});
