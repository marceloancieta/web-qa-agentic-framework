import { expect, test } from '@playwright/test';
import {
  findFocusTrap,
  focusChangesRendering,
  focused,
  hasVisibleFocus,
  tabOrder,
  tabUntil,
} from '../keyboard';
import { clippedText, horizontalOverflow, settledHorizontalOverflow } from '../layout';

const FORM = `<!doctype html><html lang="en"><head><title>Form</title><style>
  #plain:focus { outline: none; }
</style></head><body><main>
  <label for="email">Email</label><input id="email">
  <button aria-label="Show password">👁</button>
  <span id="hint">Remember me</span><input type="checkbox" aria-labelledby="hint">
  <button id="plain">Sign in</button>
</main></body></html>`;

test('the tab order names each stop, then leaves the page', async ({ page }) => {
  await page.setContent(FORM);
  expect(await tabOrder(page, 4)).toEqual([
    { role: 'input', name: 'Email' },
    { role: 'button', name: 'Show password' },
    { role: 'input', name: 'Remember me' },
    { role: 'button', name: 'Sign in' },
  ]);
  expect(await findFocusTrap(page)).toBeNull();
  expect(await focused(page)).toEqual({ role: 'body', name: '' });
});

test('an input drawn as a button is named by its value or alt text, a typed value never names a field', async ({
  page,
}) => {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Inputs</title></head><body>
    <form>
      <input placeholder="Search" value="typed by someone">
      <input type="submit" value="Log in">
      <input type="image" alt="Go" src="data:,">
    </form></body></html>`);
  expect(await tabOrder(page, 3)).toEqual([
    { role: 'input', name: 'Search' },
    { role: 'input', name: 'Log in' },
    { role: 'input', name: 'Go' },
  ]);
});

test('Tab is pressed until the target has focus, at most the given times, and the stops are returned', async ({
  page,
}) => {
  await page.setContent(FORM);
  const signIn = page.getByRole('button', { name: 'Sign in' });
  expect(await tabUntil(page, signIn, 10)).toEqual([
    { role: 'input', name: 'Email' },
    { role: 'button', name: 'Show password' },
    { role: 'input', name: 'Remember me' },
    { role: 'button', name: 'Sign in' },
  ]);
  await expect(signIn).toBeFocused();
  expect(await tabUntil(page, signIn, 10)).toEqual([]);

  await page.setContent(FORM);
  expect(await tabUntil(page, signIn, 2)).toHaveLength(2);
  await expect(signIn).not.toBeFocused();
});

test('a focus trap is found and returns its cycle', async ({ page }) => {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Trap</title></head><body>
    <button>Outside</button>
    <div id="widget"><button>First</button><button>Second</button></div>
    <script>
      const [first, second] = document.querySelectorAll('#widget button');
      second.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); first.focus(); } });
    </script></body></html>`);
  expect(await findFocusTrap(page)).toEqual([
    { role: 'button', name: 'First' },
    { role: 'button', name: 'Second' },
  ]);
});

test('a focus indicator is visible unless the page removed it', async ({ page }) => {
  await page.setContent(FORM);
  expect(await hasVisibleFocus(page.getByRole('button', { name: 'Show password' }))).toBe(true);
  expect(await hasVisibleFocus(page.getByRole('button', { name: 'Sign in' }))).toBe(false);
});

test("a focus indicator drawn on the field's wrapper is seen by rendering, not by the element's style", async ({
  page,
}) => {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Wrapped</title><style>
    .field { padding: 6px; border: 2px solid transparent; }
    .field.marked:focus-within { border-color: #1a73e8; }
    input { border: 1px solid #888; outline: none; }
    </style></head><body>
    <div class="field marked" id="marked"><label>Name <input></label></div>
    <div class="field" id="plain"><label>Code <input></label></div></body></html>`);
  const name = page.getByRole('textbox', { name: 'Name' });
  const code = page.getByRole('textbox', { name: 'Code' });
  expect(await hasVisibleFocus(name)).toBe(false);
  expect(await focusChangesRendering(name, page.locator('#marked'))).toBe(true);
  expect(await focusChangesRendering(code, page.locator('#plain'))).toBe(false);
});

test('horizontal overflow and clipped text are measured, an ellipsis is accepted', async ({
  page,
}) => {
  await page.setViewportSize({ width: 400, height: 600 });
  await page.setContent(`<!doctype html><html lang="en"><head><title>Layout</title><style>
    body { margin: 0; } .box { width: 120px; white-space: nowrap; overflow: hidden; }
    .ellipsis { text-overflow: ellipsis; }
  </style></head><body><main>
    <p class="box" id="cut">An extremely long product name that cannot fit</p>
    <p class="box ellipsis">Another extremely long product name with an ellipsis</p>
    <p>Wraps normally across lines without trouble at all</p>
  </main></body></html>`);
  expect(await horizontalOverflow(page)).toBe(0);
  const clipped = await clippedText(page.locator('main'));
  expect(clipped.map((c) => c.text)).toEqual(['An extremely long product name that cannot fit']);

  await page.evaluate(() => {
    const wide = document.createElement('div');
    wide.style.width = '650px';
    wide.textContent = 'wide banner';
    document.body.append(wide);
  });
  expect(await horizontalOverflow(page)).toBe(250);
});

test('sideways scroll inside a container counts, and what cannot scroll does not', async ({
  page,
}) => {
  await page.setViewportSize({ width: 400, height: 300 });
  const shell = (overflow: string, width: string) =>
    page.setContent(`<!doctype html><html lang="en"><head><title>Shell</title><style>
      html, body { margin: 0; overflow: hidden; }
      #shell { width: 400px; height: 300px; overflow: ${overflow}; }
      #content { width: ${width}; height: 10px; }
    </style></head><body><div id="shell"><div id="content"></div></div></body></html>`);

  await shell('auto', '650px');
  expect(await horizontalOverflow(page), 'a shell that scrolls').toBe(250);
  await shell('scroll', '650px');
  expect(await horizontalOverflow(page), 'a shell that always scrolls').toBe(250);
  await shell('auto', '400px');
  expect(await horizontalOverflow(page), 'a shell whose content fits').toBe(0);
  await shell('hidden', '650px');
  expect(await horizontalOverflow(page), 'content cut off, which clippedText reads').toBe(0);

  await page.setContent(`<!doctype html><html lang="en"><head><title>Body</title><style>
    html { overflow: hidden; }
    body { margin: 0; width: 400px; height: 300px; overflow: auto; }
    #content { width: 650px; height: 10px; }
  </style></head><body><div id="content"></div></body></html>`);
  expect(await horizontalOverflow(page), 'the body as the scroller').toBe(250);
});

test('a settled overflow waits out a moment of width, and keeps one that lasts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 400, height: 300 });
  await page.setContent(`<!doctype html><html lang="en"><head><title>Settling</title></head>
    <body style="margin: 0"><div id="wide" style="width: 650px; height: 10px"></div></body></html>`);
  expect(await settledHorizontalOverflow(page, 100), 'an overflow that lasts').toBe(250);

  await page.evaluate(() => {
    setTimeout(() => document.getElementById('wide')?.remove(), 150);
  });
  expect(await settledHorizontalOverflow(page), 'an overflow gone within the window').toBe(0);
});
