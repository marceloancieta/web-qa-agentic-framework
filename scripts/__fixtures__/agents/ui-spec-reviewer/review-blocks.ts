// Building blocks of the basket review fixtures: a page object for the basket, one for the
// product cards of the search page, and a client for the basket API. They stand for what
// qa-automate would build in apps/juice-shop/ and follow the same layers: locate and act, never
// assert.

import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { AccountApi } from '../../../../apps/juice-shop/api/account-api';
import type { Actor } from '../../../../fixtures';

export const APPLE_JUICE = { id: 1, name: 'Apple Juice (1000ml)', price: 1.99 };
export const ORANGE_JUICE = { id: 2, name: 'Orange Juice (1000ml)', price: 2.99 };

export class BasketReviewPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('#/basket');
  }

  title(): Locator {
    return this.page.getByRole('heading', { level: 1, name: /^Your Basket/ });
  }

  rows(): Locator {
    return this.page.getByRole('table').getByRole('row').filter({ has: this.page.getByRole('cell') });
  }

  row(product: string): Locator {
    return this.page.getByRole('row', { name: product });
  }

  quantityOf(product: string): Locator {
    // the first row is the product the case added
    return this.page.locator('mat-cell.mat-column-quantity').nth(0); // expect-review: brittle-locator
  }

  remove(product: string): Promise<void> {
    return this.row(product).getByRole('button', { name: 'Remove from basket' }).click();
  }

  total(): Locator {
    return this.page.getByText(/^Total Price: /);
  }

  checkout(): Locator {
    // the Material button has no test id
    return this.page.locator('button.mat-raised-button.mat-primary'); // expect-review: brittle-locator
  }
}

export class SearchReviewPage {
  constructor(private readonly page: Page) {}

  async open(term?: string): Promise<void> {
    await this.page.goto(term ? `#/search?q=${encodeURIComponent(term)}` : '#/search');
  }

  card(product: string): Locator {
    return this.page.getByRole('article').filter({ has: this.page.getByRole('img', { name: product }) });
  }

  addToBasket(product: string): Promise<void> {
    return this.card(product).getByRole('button', { name: 'Add to Basket' }).click();
  }

  notification(): Locator {
    // The text ends with the product the case added; the start is the shop's own wording.
    return this.page.getByText(/(Placed .+ into basket|Added another .+ to basket)\.$/);
  }

  limitMessage(): Locator {
    return this.page.getByText(/^You can order only up to \d+ items of this product\.$/);
  }

  basketButton(): Locator {
    return this.page.getByRole('button', { name: 'Show the shopping cart' });
  }
}

export interface BasketItem {
  id: number;
  ProductId: number;
  quantity: number;
}

/** The basket of the signed-in customer, through the API the page itself calls. */
export class BasketReviewApi {
  constructor(private readonly api: APIRequestContext) {}

  async items(basketId: number): Promise<BasketItem[]> {
    const response = await this.api.get(`rest/basket/${basketId}`);
    const { data } = (await response.json()) as { data: { Products: { BasketItem: BasketItem }[] } };
    return data.Products.map((product) => product.BasketItem);
  }

  async add(basketId: number, productId: number, quantity = 1): Promise<void> {
    const response = await this.api.post('api/BasketItems/', {
      data: { ProductId: productId, BasketId: String(basketId), quantity },
    });
    if (!response.ok()) throw new Error(`the basket refused product ${productId}: ${response.status()}`);
  }

  /** The HTTP status the basket API answers for a basket id, for the cases about who may read it. */
  async status(basketId: number): Promise<number> {
    return (await this.api.get(`rest/basket/${basketId}`)).status();
  }

  /** How many of a product one customer may order, as the shop's stock table says. */
  async limitOf(productId: number): Promise<number> {
    const response = await this.api.get('api/Quantitys/');
    const { data } = (await response.json()) as {
      data: { ProductId: number; limitPerUser: number | null; quantity: number }[];
    };
    const row = data.find((entry) => entry.ProductId === productId);
    if (!row) throw new Error(`no stock row for product ${productId}`);
    return row.limitPerUser ?? row.quantity;
  }

  async empty(basketId: number): Promise<void> {
    for (const item of await this.items(basketId)) await this.api.delete(`api/BasketItems/${item.id}`);
  }
}

/**
 * The basket of a signed-in actor, emptied, so a case starts from nothing it did not put there.
 * The `customer` account lives for the worker, so the previous case's items would still be in it.
 */
export async function emptyBasketOf(actor: Actor): Promise<{ bid: number; basket: BasketReviewApi }> {
  if (!actor.account) throw new Error(`the ${actor.role} actor has no account, so no basket`);
  const { bid } = await new AccountApi(actor.api).login(actor.account);
  const basket = new BasketReviewApi(actor.api);
  await basket.empty(bid);
  return { bid, basket };
}
