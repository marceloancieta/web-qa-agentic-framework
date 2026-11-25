// Visual: the two-factor pages on every device project, compared with baselines rendered in the
// pinned image (npm run lanes:visual). Every other run leaves this file's cases out. The QR code
// changes with every secret, so the setup page masks it.

import { expect, test } from '../../fixtures';
import { aTwoFactorCustomer, passwordStep } from '../../flows/two-factor';
import { TwoFactorCodePage } from '../../pages/two-factor-code-page';
import { TwoFactorSetupPage } from '../../pages/two-factor-setup-page';

// The setup page logs this error until LOCAL-61 is fixed (TC-TWOFACTOR-24); only its case allows it.
const QR_ERROR = /\[angularx-qrcode\] Error generating QR Code/;

test.describe('the setup page', () => {
  test.use({ pageHealth: { allowConsole: [QR_ERROR] } });

  test('TC-TWOFACTOR-26 the setup page with two-factor authentication off looks as designed, the QR code masked @regression @visual @layout', async ({
    customer,
    visual,
  }) => {
    // The worker's customer, whose setting is never turned on: the page only shows its form.
    const setup = new TwoFactorSetupPage(customer.page);
    await setup.openForSetup();
    await expect(setup.save()).toBeVisible();
    await visual.expectToMatch(customer.page, 'two-factor-setup.png', setup.masks(), {
      wholePage: true,
    });
  });
});

test('TC-TWOFACTOR-27 /#/2fa/enter waiting for a code looks as designed @regression @visual @layout', async ({
  page,
  actor,
  qa,
  visual,
}) => {
  test.skip(!qa.allowWrites, 'the case turns two-factor authentication on; allow_writes is false');
  const { account } = await aTwoFactorCustomer(actor);
  const code = new TwoFactorCodePage(page);
  await passwordStep(page, account);
  await expect(code.title()).toBeVisible();
  await expect(code.submit()).toBeDisabled();
  await visual.expectToMatch(page, 'two-factor-code.png', [], { wholePage: true });
});
