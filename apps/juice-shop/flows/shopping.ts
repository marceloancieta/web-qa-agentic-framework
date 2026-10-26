// Business tasks a customer does through the UI, shared by the journeys and the feature specs. A flow
// acts and returns what the case needs next; whether each step worked is for the spec to assert.

import type { Page } from '@playwright/test';
import type { Account } from '../../../helpers/actors';
import type { Address } from '../builders/address-builder';
import type { Card } from '../builders/card-builder';
import { lastFour } from '../builders/card-builder';
import { Toolbar } from '../components/toolbar';
import { AddressFormPage } from '../pages/address-form-page';
import { AddressSelectPage } from '../pages/address-select-page';
import { BasketPage } from '../pages/basket-page';
import { DeliveryPage, type DeliveryMethod } from '../pages/delivery-page';
import { LoginPage } from '../pages/login-page';
import { PaymentPage } from '../pages/payment-page';
import { RegisterPage } from '../pages/register-page';
import { SearchPage } from '../pages/search-page';

/** Sign in through the login form and wait for the move to the search page that ends it. */
export async function signInThroughForm(page: Page, account: Account): Promise<void> {
  const login = new LoginPage(page);
  await login.open();
  await login.signIn(account.username, account.password);
  await page.waitForURL(/#\/search$/);
}

/** Register through the form; the shop moves to the login once the account exists. */
export async function registerThroughForm(
  page: Page,
  account: Account,
  answer: string,
): Promise<void> {
  const register = new RegisterPage(page);
  await register.open();
  await register.register(account.username, account.password, answer);
}

/** Search from the toolbar and add a product from the results. */
export async function searchAndAdd(page: Page, term: string, product: string): Promise<void> {
  await new Toolbar(page).search(term);
  await new SearchPage(page).addToBasket(product).click();
}

/** From the toolbar's basket button to the address step. */
export async function startCheckout(page: Page): Promise<void> {
  await new Toolbar(page).openBasket();
  await new BasketPage(page).checkout().click();
}

/** Add a new address through the form, choose it and go on to the delivery step. */
export async function chooseNewAddress(page: Page, address: Address): Promise<void> {
  const select = new AddressSelectPage(page);
  await select.addNew().click();
  await new AddressFormPage(page).fill(address);
  await new AddressFormPage(page).submit().click();
  await select.choose(address.fullName);
  await select.proceed().click();
}

/** Choose an address saved before the case (through `api/`) and go on to the delivery step. */
export async function chooseSavedAddress(page: Page, fullName: string): Promise<void> {
  const select = new AddressSelectPage(page);
  await select.choose(fullName);
  await select.proceed().click();
}

/** Choose a card saved before the case (through `api/`) and go on to the summary. */
export async function chooseSavedCard(page: Page, card: Pick<Card, 'cardNum'>): Promise<void> {
  const payment = new PaymentPage(page);
  await payment.choose(lastFour(card));
  await payment.proceed().click();
}

export async function chooseDelivery(page: Page, method: DeliveryMethod): Promise<void> {
  const delivery = new DeliveryPage(page);
  await delivery.choose(method);
  await delivery.proceed().click();
}

/** Add a new card, choose it and go on to the summary. */
export async function payWithNewCard(page: Page, card: Card): Promise<void> {
  const payment = new PaymentPage(page);
  await payment.openNewCard();
  await payment.fill(card);
  await payment.submit().click();
  await payment.choose(lastFour(card));
  await payment.proceed().click();
}
