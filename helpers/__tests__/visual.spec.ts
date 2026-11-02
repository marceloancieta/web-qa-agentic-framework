import { expect, test } from '@playwright/test';
import { fitViewportToContent, imagesLoaded } from '../visual';

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

// A 1×1 PNG, served by a route the test holds until it lets the image through.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);

async function heldImagePage(page: import('@playwright/test').Page, body: string) {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('http://img.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/held.png') {
      await held;
      return route.fulfill({ contentType: 'image/png', body: PIXEL });
    }
    if (path === '/missing.png') return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: 'text/html', body });
  });
  return { release };
}

test('a screenshot waits for the images in view, and a broken or lazy offscreen one does not hold it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  const { release } = await heldImagePage(
    page,
    `<!doctype html><html lang="en"><title>t</title><body style="margin:0">
      <img alt="held" src="/held.png" width="100" height="100">
      <img alt="missing" src="/missing.png" width="100" height="100">
      <div style="height:5000px"></div>
      <img alt="far" loading="lazy" src="/held-far.png" width="100" height="100">
    </body></html>`,
  );
  // The load event waits for the held image, so the test goes on once the document is parsed.
  await page.goto('http://img.test/', { waitUntil: 'domcontentloaded' });
  let done = false;
  const waiting = imagesLoaded(page).then(() => (done = true));
  // The held image cannot arrive yet, so the wait cannot be over.
  await page.evaluate(() => document.title);
  expect(done).toBe(false);
  release();
  await waiting;
  expect(
    await page.getByAltText('held').evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBe(1);
});

test('an image that never arrives fails the wait with its source', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await heldImagePage(
    page,
    '<!doctype html><html lang="en"><title>t</title><img alt="held" src="/held.png" width="10" height="10"></html>',
  );
  // The load event waits for the held image, so the test goes on once the document is parsed.
  await page.goto('http://img.test/', { waitUntil: 'domcontentloaded' });
  await expect(imagesLoaded(page, 300)).rejects.toThrow(
    /^Images still loading after 300 ms, so the screenshot would not show them: http:\/\/img\.test\/held\.png$/,
  );
});
