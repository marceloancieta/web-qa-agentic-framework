// Visual: the first page of all products on every device project, compared with baselines
// rendered in the pinned image (npm run lanes:visual). Every other run leaves this file's cases out.
// The cards' stock ribbons change with each start and are hidden by the pack's visual stylesheet.

import { SearchPage } from '../../pages/search-page';
import { expect, test } from '../../fixtures';

test('TC-SEARCH-13 the first page of all products looks as designed @regression @visual @layout', async ({
  page,
  visual,
}) => {
  const search = new SearchPage(page);
  await search.open();
  // WebKit in the pinned image can take longer than 5 s to draw the catalogue once it has arrived.
  await expect(search.range()).toHaveText(/1 – 15 of \d+/, { timeout: 15_000 });
  await expect(search.products()).toHaveCount(15);
  await visual.expectToMatch(page, 'all-products.png', [], { wholePage: true });
});
