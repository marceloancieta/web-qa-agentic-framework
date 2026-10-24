import type { Page } from '@playwright/test';
import { CartPage } from '../pages/cart-page';

// A flow composes pages and returns what the spec asserts on; it never asserts itself.
export async function checkout(page: Page): Promise<CartPage> {
  const cart = new CartPage(page);
  await cart.open();
  await cart.checkout();
  const expected = await cart.total().textContent();
  return expectedTotal(cart, expected);
}

function expectedTotal(cart: CartPage, _total: string | null): CartPage {
  return cart;
}
