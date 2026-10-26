// A customer's basket, for arranging products before a case and reading the basket back after it.
// The basket's id comes with the login answer (`bid`), which is also what the frontend keeps in
// session storage.

import type { APIRequestContext } from '@playwright/test';
import type { Account } from '../../../helpers/actors';
import { AccountApi } from './account-api';

export interface BasketLine {
  name: string;
  price: number;
  quantity: number;
}

export class BasketApi {
  constructor(
    private readonly api: APIRequestContext,
    readonly basketId: number,
    /** The account's token, sent with every call, so any client can read the account's basket. */
    private readonly headers: Record<string, string> = {},
  ) {}

  /** The basket of an account, signed in through the API for this client. */
  static async of(api: APIRequestContext, account: Account): Promise<BasketApi> {
    const { token, bid } = await new AccountApi(api).login(account);
    return new BasketApi(api, bid, { Authorization: `Bearer ${token}` });
  }

  /** Put `quantity` of a product into the basket, as Add to Basket does for the first one. */
  async add(productId: number, quantity = 1): Promise<void> {
    const response = await this.api.post('api/BasketItems/', {
      data: { ProductId: productId, BasketId: String(this.basketId), quantity },
      headers: this.headers,
    });
    if (!response.ok()) {
      const { error } = (await response.json().catch(() => ({}))) as { error?: string };
      // Every order a run places uses up stock, and nothing gives it back but a restart.
      const hint = /out of stock/i.test(error ?? '')
        ? ' The shared stock is used up: restore it with the pack recovery (npm run juice-shop:down, then juice-shop:up).'
        : '';
      throw new Error(
        `Juice Shop refused product ${productId} for the basket: ${response.status()} ${error ?? ''}.${hint}`,
      );
    }
  }

  async lines(): Promise<BasketLine[]> {
    const response = await this.api.get(`rest/basket/${this.basketId}`, { headers: this.headers });
    if (!response.ok()) throw new Error(`The basket did not load: ${response.status()}.`);
    const { data } = (await response.json()) as {
      data: { Products: { name: string; price: number; BasketItem: { quantity: number } }[] };
    };
    return data.Products.map((p) => ({
      name: p.name,
      price: p.price,
      quantity: p.BasketItem.quantity,
    }));
  }
}
