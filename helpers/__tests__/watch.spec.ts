import { becomesVisibleWithin } from '../watch';
import { expect, test } from './fake-app';

const PAGE = `<!doctype html><html lang="en"><body><button>Save</button><script>
document.querySelector('button').addEventListener('click', () => setTimeout(() => {
  const note = document.createElement('p');
  note.textContent = 'Saved';
  document.body.append(note);
  setTimeout(() => note.remove(), 400);
}, 200));
</script></body></html>`;

test('a notice that shows and closes by itself is caught by the watch, not by a retrying check', async ({
  page,
}) => {
  await page.setContent(PAGE);
  const notice = page.getByText('Saved', { exact: true });
  const watch = becomesVisibleWithin(notice, 2000);
  await page.getByRole('button', { name: 'Save' }).click();
  expect(await watch).toBe(true);
  // The retrying negative check passes once the notice has closed: what the watch is for.
  await expect(notice).toHaveCount(0);
});

test('nothing appearing in the window answers false', async ({ page }) => {
  await page.setContent('<!doctype html><html lang="en"><body><p>Quiet</p></body></html>');
  expect(await becomesVisibleWithin(page.getByText('Saved', { exact: true }), 300)).toBe(false);
});
