import { expect, test } from '@playwright/test';
import { downloadFrom, fileFrom, fileOfSize } from '../files';
import { advance, durationMs, startClockAt } from '../time';

test('durations are read in every unit, and anything else is refused', () => {
  expect(durationMs('250ms')).toBe(250);
  expect(durationMs('90s')).toBe(90_000);
  expect(durationMs('1h30m')).toBe(5_400_000);
  expect(durationMs('2d')).toBe(172_800_000);
  for (const bad of ['15 minutes', '', '1x', '10'])
    expect(() => durationMs(bad), bad).toThrow(/not a duration/);
});

test('a session countdown under a controlled clock', async ({ page }) => {
  await startClockAt(page, '2026-03-01T09:00:00Z');
  await page.setContent(`<!doctype html><html lang="en"><head><title>Session</title></head><body>
    <p id="today"></p><p role="status" id="left">15 minutes left</p><script>
    document.getElementById('today').textContent = new Date().toISOString().slice(0, 10);
    let minutes = 15;
    const timer = setInterval(() => {
      minutes -= 1;
      document.getElementById('left').textContent =
        minutes > 0 ? minutes + ' minutes left' : 'Your session has expired';
      if (minutes === 0) clearInterval(timer);
    }, 60000);
  </script></body></html>`);
  await expect(page.locator('#today')).toHaveText('2026-03-01');
  await advance(page, '14m');
  await expect(page.getByRole('status')).toHaveText('1 minutes left');
  await advance(page, 60_000);
  await expect(page.getByRole('status')).toHaveText('Your session has expired');
  await expect(startClockAt(page, 'not a date')).rejects.toThrow(/is not a date/);
});

test('an upload built in memory and a download read back', async ({ page }, testInfo) => {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Files</title></head><body>
    <label for="file">Attachment</label><input id="file" type="file"><p id="picked"></p>
    <a href="data:text/csv;charset=utf-8,name%2Cqty%0Aapple%2C2%0A" download="order.csv">Export order</a>
    <script>
      document.getElementById('file').addEventListener('change', (e) => {
        const f = e.target.files[0];
        document.getElementById('picked').textContent = f.name + ' ' + f.size + ' bytes';
      });
    </script></body></html>`);
  await page.getByLabel('Attachment').setInputFiles(fileFrom('notes.txt', 'hello'));
  await expect(page.locator('#picked')).toHaveText('notes.txt 5 bytes');
  await page.getByLabel('Attachment').setInputFiles(fileOfSize('big.bin', 2048));
  await expect(page.locator('#picked')).toHaveText('big.bin 2048 bytes');

  const file = await downloadFrom(page, testInfo, () =>
    page.getByRole('link', { name: 'Export order' }).click(),
  );
  expect(file.name).toBe('order.csv');
  expect(await file.text()).toBe('name,qty\napple,2\n');
  expect(file.size).toBe(17);
});
