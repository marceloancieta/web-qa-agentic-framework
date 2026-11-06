// The checkout's address step (registry/checkout.md): the empty list, a new address saved through the
// form, the form's boundaries and a failed save. The cases that save or fill a basket take a
// customer of their own, created for the case; the boundary cases only fill the form, never submit
// it, so they use the worker's customer.

import { knownGap } from '../../../../helpers/case-meta';
import { becomesVisibleWithin } from '../../../../helpers/watch';
import { BasketApi } from '../../api/basket-api';
import { CatalogueApi } from '../../api/catalogue-api';
import { CheckoutApi } from '../../api/checkout-api';
import { ADDRESS_LIMITS, anAddress, longStreet } from '../../builders/address-builder';
import { expect, test, type Actor } from '../../fixtures';
import { ADDRESS_SAVE, addressSaveAnswered, addressSaveFails } from '../../mocks/checkout-mocks';
import { AddressFormPage, type AddressField } from '../../pages/address-form-page';
import { AddressSelectPage } from '../../pages/address-select-page';
import { BasketPage } from '../../pages/basket-page';
import { DeliveryPage } from '../../pages/delivery-page';

// <PRODUCT>: the most stocked product without a limit per customer (the `stockedProduct` fixture).
let PRODUCT = '';
test.beforeEach(({ stockedProduct }) => {
  PRODUCT = stockedProduct.name;
});
const MOBILE_MESSAGE = 'Mobile number must match 1000000-9999999999 format.';
const REQUIRED: [AddressField, string][] = [
  ['Country', 'Please provide a country.'],
  ['Name', 'Please provide a name.'],
  ['Mobile Number', 'Please provide a mobile number.'],
  ['ZIP Code', 'Please provide a ZIP code.'],
  ['Address', 'Please provide an address.'],
  ['City', 'Please provide a city.'],
];
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const added = (city: string) =>
  new RegExp(`The address at ${escaped(city)} has been successfully added to your addresses\\.`);

/** Put <PRODUCT> into the customer's basket through the API, as the cases' entry state. */
async function withProductInBasket(customer: Actor): Promise<void> {
  if (!customer.account) throw new Error('A fresh customer has an account.');
  const product = await new CatalogueApi(customer.api).product(PRODUCT);
  await (await BasketApi.of(customer.api, customer.account)).add(product.id);
}

/**
 * Open the basket and press Checkout once the product's row is there. Resolves once the address
 * step's list has answered, so a check on the list cannot pass on the table before it loads.
 */
async function checkoutFromBasket(customer: Actor): Promise<void> {
  const basket = new BasketPage(customer.page);
  const contents = basket.contentsLoaded();
  await basket.open();
  await contents;
  await expect(basket.row(PRODUCT)).toBeVisible();
  const addresses = new AddressSelectPage(customer.page).loaded();
  await basket.checkout().click();
  await addresses;
}

test('TC-CHECKOUT-01 Checkout from a basket with <PRODUCT> opens "Select an address" with no address listed and Continue disabled @regression @navigation', async ({
  actor,
  qa,
}) => {
  test.skip(
    !qa.allowWrites,
    'the case creates an account and fills its basket; allow_writes is false',
  );
  const customer = await actor('customer', { fresh: true });
  await withProductInBasket(customer);
  // The entry state: an account created for the case has no address.
  expect(await new CheckoutApi(customer.api).addresses()).toEqual([]);

  await checkoutFromBasket(customer);

  const select = new AddressSelectPage(customer.page);
  await expect(customer.page).toHaveURL(/#\/address\/select$/);
  await expect(select.heading()).toBeVisible();
  await expect(select.addNew()).toBeVisible();
  await expect(select.addresses()).toHaveCount(0);
  await expect(select.proceed()).toBeDisabled();
});

test('TC-CHECKOUT-02 an address added through the form returns to "Select an address", says "The address at <CITY> has been successfully added to your addresses." and lists it, and the API holds it @regression', async ({
  actor,
  qa,
}) => {
  test.skip(
    !qa.allowWrites,
    'the case saves an address to an account it creates; allow_writes is false',
  );
  const customer = await actor('customer', { fresh: true });
  await withProductInBasket(customer);
  const address = anAddress();
  const select = new AddressSelectPage(customer.page);
  const form = new AddressFormPage(customer.page);

  await checkoutFromBasket(customer);
  await expect(select.heading()).toBeVisible();
  await select.addNew().click();
  await expect(form.heading()).toBeVisible();
  await form.fill(address);
  await form.submit().click();

  await expect(customer.page).toHaveURL(/#\/address\/select$/);
  await expect(select.heading()).toBeVisible();
  await expect(form.notification(added(address.city))).toBeVisible();
  const row = select.address(address.fullName);
  await expect(row).toBeVisible();
  for (const part of [address.streetAddress, address.city, address.zipCode, address.country])
    await expect(row).toContainText(part);
  await expect(select.addresses()).toHaveCount(1);

  const saved = await new CheckoutApi(customer.api).addresses();
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ ...address });
});

test('TC-CHECKOUT-03 the new address form keeps Submit disabled while empty, and each required field left empty says "Please provide a <field>." @regression @navigation', async ({
  customer,
}) => {
  const form = new AddressFormPage(customer.page);
  await form.open();
  await expect(form.heading()).toBeVisible();
  await expect(form.submit()).toBeDisabled();

  // Every other field is valid in each step, so it is this field alone that disables Submit.
  const address = anAddress();
  for (const [label, message] of REQUIRED) {
    await test.step(`${label} left empty says why`, async () => {
      await form.fill(address);
      await expect(form.submit()).toBeEnabled();
      await expect(form.message(message)).toBeHidden();
      await form.clear(label);
      await form.touch([label]);
      await expect(form.message(message)).toBeVisible();
      await expect(form.submit()).toBeDisabled();
    });
  }
});

test('TC-CHECKOUT-04 an address with every required field and no State is saved @regression', async ({
  actor,
  qa,
}) => {
  test.skip(
    !qa.allowWrites,
    'the case saves an address to an account it creates; allow_writes is false',
  );
  const customer = await actor('customer', { fresh: true });
  const address = anAddress({ state: undefined });
  const select = new AddressSelectPage(customer.page);
  const form = new AddressFormPage(customer.page);

  // Through the list, as a customer gets here: the form returns to the page it was opened from.
  const addresses = select.loaded();
  await select.open();
  await addresses;
  await select.addNew().click();
  await expect(form.heading()).toBeVisible();
  await form.fill(address);
  await expect(form.field('State')).toHaveValue('');
  await expect(form.submit()).toBeEnabled();
  await form.submit().click();

  await expect(customer.page).toHaveURL(/#\/address\/select$/);
  await expect(form.notification(added(address.city))).toBeVisible();
  await expect(select.address(address.fullName)).toBeVisible();

  const saved = await new CheckoutApi(customer.api).addresses();
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    fullName: address.fullName,
    mobileNum: address.mobileNum,
    zipCode: address.zipCode,
    streetAddress: address.streetAddress,
    city: address.city,
    country: address.country,
  });
  expect(saved[0]?.state ?? '').toBe('');
});

test('TC-CHECKOUT-08 with one saved address, Continue is enabled only once it is chosen, and leads to the delivery step showing that address and its mobile number @regression @navigation', async ({
  actor,
  qa,
}) => {
  test.skip(
    !qa.allowWrites,
    'the case saves an address and fills the basket of an account it creates; allow_writes is false',
  );
  const customer = await actor('customer', { fresh: true });
  await withProductInBasket(customer);
  const address = anAddress();
  await new CheckoutApi(customer.api).addAddress(address);
  const select = new AddressSelectPage(customer.page);
  const delivery = new DeliveryPage(customer.page);

  await checkoutFromBasket(customer);
  await expect(select.heading()).toBeVisible();
  await expect(select.addresses()).toHaveCount(1);
  await expect(select.proceed()).toBeDisabled();

  await select.choose(address.fullName);
  await expect(select.proceed()).toBeEnabled();
  await select.proceed().click();

  await expect(customer.page).toHaveURL(/#\/delivery-method$/);
  await expect(delivery.heading()).toBeVisible();
  for (const part of [address.fullName, address.streetAddress, String(address.mobileNum)])
    await expect(delivery.deliveryAddress(part)).toBeVisible();
});

test('TC-CHECKOUT-06 a mobile number of 999999 or 10000000000 says "Mobile number must match 1000000-9999999999 format." and keeps Submit disabled; 1000000 and 9999999999 are accepted @regression @known-gap', async ({
  customer,
}) => {
  // Each value flips the state the one before it left, so no check passes on the previous state.
  // The minimum comes last, in a step of its own: the form refuses it today (LOCAL-14).
  const values = [
    { mobileNum: ADDRESS_LIMITS.mobileMax + 1, accepted: false, name: 'one past the maximum' },
    { mobileNum: ADDRESS_LIMITS.mobileMax, accepted: true, name: 'the maximum' },
    { mobileNum: ADDRESS_LIMITS.mobileMin - 1, accepted: false, name: 'one below the minimum' },
  ];
  const address = anAddress();
  const form = new AddressFormPage(customer.page);
  await form.open();
  await expect(form.heading()).toBeVisible();

  const enter = async (mobileNum: number, accepted: boolean) => {
    await form.fill({ ...address, mobileNum });
    await form.touch(['Mobile Number']);
    await expect(form.field('Mobile Number')).toHaveValue(String(mobileNum));
    await expect(form.message(MOBILE_MESSAGE)).toHaveCount(accepted ? 0 : 1);
    await expect(form.submit()).toBeEnabled({ enabled: accepted });
  };

  for (const { mobileNum, accepted, name } of values) {
    await test.step(`enter ${mobileNum}, ${name}, and leave the field`, () =>
      enter(mobileNum, accepted));
  }

  await test.step(`enter ${ADDRESS_LIMITS.mobileMin}, the minimum, and leave the field`, async () => {
    test.fail(
      true,
      await knownGap('LOCAL-14', 'the form refuses mobile numbers from 1000000 to 1111110'),
    );
    await enter(ADDRESS_LIMITS.mobileMin, true);
  });
});

test('TC-CHECKOUT-07 a ZIP Code of 8 characters is accepted and one of 9 is invalid ("9/8"); <LONG_ADDRESS> is accepted and a 161st character is not taken @regression @content', async ({
  customer,
}) => {
  const zipMax = ADDRESS_LIMITS.zipMax;
  const streetMax = ADDRESS_LIMITS.streetMax;
  const address = anAddress();
  const form = new AddressFormPage(customer.page);
  await form.open();
  await expect(form.heading()).toBeVisible();

  // Each ZIP Code flips the state the one before it left.
  const zips = [
    { length: zipMax - 1, accepted: true, name: 'one below the limit' },
    { length: zipMax + 1, accepted: false, name: 'one past the limit' },
    { length: zipMax, accepted: true, name: 'at the limit' },
  ];
  for (const { length, accepted, name } of zips) {
    await test.step(`enter a ZIP Code of ${length} characters, ${name}`, async () => {
      const zipCode = '1234567890'.slice(0, length);
      await form.fill({ ...address, zipCode });
      await form.touch(['ZIP Code']);
      await expect(form.field('ZIP Code')).toHaveValue(zipCode);
      await expect(form.message(`${length}/${zipMax}`)).toBeVisible();
      await expect(form.submit()).toBeEnabled({ enabled: accepted });
    });
  }

  const streets = [
    { length: streetMax - 1, name: 'one below the limit' },
    { length: streetMax, name: 'at the limit, <LONG_ADDRESS>' },
    { length: streetMax + 1, name: 'one past the limit' },
  ];
  for (const { length, name } of streets) {
    await test.step(`enter an address of ${length} characters, ${name}`, async () => {
      const streetAddress = longStreet(length);
      await form.fill({ ...address, streetAddress });
      await form.touch(['Address']);
      // The field keeps at most the limit: a 161st character is dropped, the rest kept whole.
      await expect(form.field('Address')).toHaveValue(streetAddress.slice(0, streetMax));
      await expect(form.submit()).toBeEnabled();
    });
  }
});

test.describe('a failed address save', () => {
  // The 500 is the mocked answer the case is about; the guard keeps watching everything else.
  test.use({ pageHealth: { allowRequests: [ADDRESS_SAVE] } });

  test('TC-CHECKOUT-23 a failed answer to saving an address is not reported as saved and the list stays empty @regression @mocked', async ({
    actor,
    qa,
  }) => {
    test.skip(
      !qa.allowWrites,
      'the case creates an account and fills its basket; allow_writes is false',
    );
    const customer = await actor('customer', { fresh: true });
    await withProductInBasket(customer);
    const address = anAddress();
    const select = new AddressSelectPage(customer.page);
    const form = new AddressFormPage(customer.page);

    await checkoutFromBasket(customer);
    await expect(select.heading()).toBeVisible();
    await select.addNew().click();
    await expect(form.heading()).toBeVisible();
    await form.fill(address);
    await addressSaveFails(customer.page);
    const answered = addressSaveAnswered(customer.page);
    // The shop's notifications close by themselves, so a retrying "not there" would miss one that
    // came and went; the watch covers the whole window from the click on.
    const shown = becomesVisibleWithin(form.notification(added(address.city)), 8000);
    await form.submit().click();
    await answered;
    expect(await shown).toBe(false);

    const listed = select.loaded();
    await select.open();
    await listed;
    await expect(select.heading()).toBeVisible();
    await expect(select.address(address.fullName)).toHaveCount(0);
    await expect(select.addresses()).toHaveCount(0);
    await expect(select.proceed()).toBeDisabled();
    expect(await new CheckoutApi(customer.api).addresses()).toEqual([]);
  });
});
