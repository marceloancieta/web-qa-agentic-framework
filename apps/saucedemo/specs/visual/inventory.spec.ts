// Visual: the product list on every device project, compared with baselines rendered in the pinned
// image (npm run lanes:visual). Every other run leaves this file's cases out. The case proves the
// lane twice: the standard actor's list matches its baseline, and the visual actor's list, which the
// application draws with other prices and a misplaced cart button on purpose, must not.

import { PRODUCT_COUNT } from '../../builders/products';
import { expect, test } from '../../fixtures';
import { InventoryPage } from '../../pages/inventory-page';

const BASELINE = 'inventory.png';

/** The list is complete, its images included: an image still loading changes the page's height. */
async function listDrawn(inventory: InventoryPage): Promise<void> {
  await expect(inventory.products()).toHaveCount(PRODUCT_COUNT);
  await expect(inventory.productImages()).toHaveCount(PRODUCT_COUNT);
  for (const image of await inventory.productImages().all()) {
    await expect(image).toHaveJSProperty('complete', true);
    await expect(image).not.toHaveJSProperty('naturalWidth', 0);
  }
  await expect(inventory.header.cartButton()).toBeVisible();
}

test("TC-INVENTORY-14 the list looks as designed, and the visual actor's list, with its other prices and misplaced cart, does not match it @regression @visual @layout", async ({
  standard,
  actor,
  visual,
}) => {
  await test.step('the standard list matches its baseline', async () => {
    const inventory = new InventoryPage(standard.page);
    await inventory.open();
    await listDrawn(inventory);
    await visual.expectToMatch(standard.page, BASELINE, [], { wholePage: true });
  });

  await test.step("the visual actor's list differs from the same baseline", async () => {
    // Compared under the same name, so it meets the standard list's baseline; expectNotToMatch
    // never writes one, even when the lane updates baselines.
    const { page } = await actor('visual');
    const inventory = new InventoryPage(page);
    await inventory.open();
    await listDrawn(inventory);
    await visual.expectNotToMatch(page, BASELINE, [], { wholePage: true });
  });
});
