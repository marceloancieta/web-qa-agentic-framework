import { expect, test } from '@playwright/test';
import {
  findFocusTrap,
  focusChangesRendering,
  focused,
  hasVisibleFocus,
  tabOrder,
} from '../keyboard';
import { clippedText, horizontalOverflow } from '../layout';

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
