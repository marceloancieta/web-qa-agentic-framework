import { expect, test } from '@playwright/test';
import { animationsOf, motionOf, pageMotion } from '../motion';

// A page that moves things, and stops moving them when the user asks for less motion, except the
// spinner, which keeps turning, and a colour fade, which is not motion.
const PAGE = `<!doctype html><html><head><style>
  .lift { transition: transform 150ms ease, background-color 100ms linear; }
  .fade { transition: opacity 200ms linear, color 200ms linear; }
  .panel { transition: width 0.3s ease; }
  .instant { transition: transform 0s; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 50% { opacity: 0.4; } }
  .spinner { animation: spin 1s linear infinite; width: 10px; height: 10px; }
  .pulse { animation: pulse 2s ease infinite; }
  @media (prefers-reduced-motion: reduce) {
    .lift, .panel { transition-property: background-color; }
  }
</style></head><body>
  <main id="main"><button class="lift" id="save">Save</button><p class="fade">Saved</p>
  <aside class="panel">Menu</aside><span class="instant">x</span></main>
  <div class="spinner" id="busy"></div><div class="pulse" id="soft"></div>
</body></html>`;

test('without a preference, the transitions that move are reported, and fades are not', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setContent(PAGE);
  expect(await motionOf(page.locator('#save'))).toEqual([
    {
      kind: 'transition',
      element: 'button#save.lift',
      properties: ['transform'],
      name: '',
      durationMs: 150,
      iterations: 1,
    },
  ]);
  expect(await motionOf(page.locator('.fade'))).toEqual([]);
  expect(await motionOf(page.locator('.instant'))).toEqual([]);
  const inside = await motionOf(page.locator('#main'), { subtree: true });
  expect(
    inside.map(({ element, properties, durationMs }) => [element, properties, durationMs]),
  ).toEqual([
    ['button#save.lift', ['transform'], 150],
    ['aside.panel', ['width'], 300],
  ]);
});

test('with reduced motion, what the page stops moving is gone, and the spinner is still there', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setContent(PAGE);
  expect(await motionOf(page.locator('#main'), { subtree: true })).toEqual([]);
  expect(await motionOf(page.locator('#busy'))).toEqual([
    {
      kind: 'animation',
      element: 'div#busy.spinner',
      properties: ['transform'],
      name: 'spin',
      durationMs: 1000,
      iterations: Infinity,
    },
  ]);
});

test('the page lists the running animations that move, and not those that only fade', async ({
  page,
}) => {
  await page.setContent(PAGE);
  const motion = await pageMotion(page);
  expect(motion.map(({ element, name }) => [element, name])).toEqual([
    ['div#busy.spinner', 'spin'],
  ]);
  await page.locator('#busy').evaluate((element) => element.remove());
  expect(await pageMotion(page)).toEqual([]);
});

test('an animation started from script is read from its keyframes', async ({ page }) => {
  await page.setContent('<div id="toast">Saved</div>');
  await page.locator('#toast').evaluate((element) => {
    element.animate([{ translate: '0 100%' }, { translate: '0 0' }], {
      duration: 5_000,
      id: 'slide-in',
    });
  });
  expect(await motionOf(page.locator('#toast'))).toEqual([
    {
      kind: 'animation',
      element: 'div#toast',
      properties: ['translate'],
      name: 'slide-in',
      durationMs: 5000,
      iterations: 1,
    },
  ]);
});

test('every running animation is listed, a pulse of opacity too, and none once they stop', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setContent(PAGE);
  const running = await animationsOf(page.locator('body'), { subtree: true });
  expect(running.map(({ element, name, iterations }) => [element, name, iterations])).toEqual([
    ['div#busy.spinner', 'spin', Infinity],
    ['div#soft.pulse', 'pulse', Infinity],
  ]);
  expect((await animationsOf(page.locator('#soft')))[0]?.properties).toEqual(['opacity']);
  // The pulse is not motion: motionOf leaves it out.
  expect(await motionOf(page.locator('#soft'))).toEqual([]);
  await page.locator('#soft').evaluate((element) => (element.style.animation = 'none'));
  expect(await animationsOf(page.locator('#soft'))).toEqual([]);
});

test('a pseudo-element that slides is reported with the element, and one that draws nothing is not', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setContent(`<style>
    a::after { content: ''; display: block; transition: transform 250ms ease; }
    a.bare::after { content: none; }
    @media (prefers-reduced-motion: reduce) { a::after { transition-property: opacity; } }
  </style><a id="drawn" href="#">Docs</a><a id="empty" class="bare" href="#">Help</a>`);
  expect(await motionOf(page.locator('#drawn'))).toEqual([
    {
      kind: 'transition',
      element: 'a#drawn::after',
      properties: ['transform'],
      name: '',
      durationMs: 250,
      iterations: 1,
    },
  ]);
  expect(await motionOf(page.locator('#empty'))).toEqual([]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await motionOf(page.locator('#drawn'))).toEqual([]);
});
