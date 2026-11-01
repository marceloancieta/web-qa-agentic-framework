// The product list a signed-in user lands on. A visitor without a session who opens it is sent
// back to the login page.

import type { Locator, Page } from '@playwright/test';
import { Header } from '../components/header';

/** The values of "Sort products", as the page writes them. */
export type SortOption = 'az' | 'za' | 'lohi' | 'hilo';

export class InventoryPage {
  readonly header: Header;

  constructor(private readonly page: Page) {
    this.header = new Header(page);
  }

  async open(): Promise<void> {
    await this.page.goto('inventory.html');
  }

  /** The list of products, rendered only for a signed-in user. */
  list(): Locator {
    // The list is a plain container without a role or an accessible name; the pack's test id is
    // the next locator in the order (ADR 0007).
    return this.page.getByTestId('inventory-list');
  }

  /** "Products", plain text in the banner rather than a heading (contract G2). */
  title(): Locator {
    return this.page.getByTestId('title');
  }

  /** One container per product. */
  products(): Locator {
    // A product is a plain container without a role; its test id is the next locator in the order.
    return this.page.getByTestId('inventory-item');
  }

  /** The names of the products, in the order the list shows them. */
  names(): Locator {
    return this.page.getByTestId('inventory-item-name');
  }

  /** The prices of the products, such as "$29.99", in the order the list shows them. */
  prices(): Locator {
    return this.page.getByTestId('inventory-item-price');
  }

  sort(): Locator {
    return this.page.getByRole('combobox', { name: 'Sort products' });
  }

  /** The option "Sort products" shows as chosen. */
  selectedSort(): Locator {
    return this.sort().getByRole('option', { selected: true });
  }

  async sortBy(option: SortOption): Promise<void> {
    await this.sort().selectOption(option);
  }

  /** The container of one product, found by its name. */
  product(name: string): Locator {
    return this.products().filter({
      has: this.page.getByTestId('inventory-item-name').getByText(name, { exact: true }),
    });
  }

  /** Every product image of the list, each named after its product. */
  productImages(): Locator {
    return this.list().getByRole('img');
  }

  /** One product's image, inside the image button that opens its page. */
  productImage(name: string): Locator {
    return this.product(name).getByRole('img', { name, exact: true });
  }

  productDescription(name: string): Locator {
    // Plain text without a role; the test id is the next locator in the order.
    return this.product(name).getByTestId('inventory-item-desc');
  }

  productPrice(name: string): Locator {
    return this.product(name).getByTestId('inventory-item-price');
  }

  /** The product's name, a button that opens its page. */
  productNameLink(name: string): Locator {
    // Two buttons share this name, the image and the name (contract G5); the name's is the one
    // with the name as its text.
    return this.product(name)
      .getByRole('button', { name: `View details for ${name}`, exact: true })
      .filter({ hasText: name });
  }

  async openProduct(name: string): Promise<void> {
    await this.productNameLink(name).click();
  }

  /** The product's "Add to cart" or "Remove" button, whichever it shows. */
  cartAction(name: string): Locator {
    return this.product(name).getByRole('button', { name: /^(Add to cart|Remove)$/ });
  }

  async addToCart(name: string): Promise<void> {
    await this.product(name).getByRole('button', { name: 'Add to cart', exact: true }).click();
  }

  async remove(name: string): Promise<void> {
    await this.product(name).getByRole('button', { name: 'Remove', exact: true }).click();
  }
}
