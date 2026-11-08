// The product catalogue, read-only: a case finds a product's id and price here instead of typing
// them, so a change of the catalogue moves the case's data with it.

import type { APIRequestContext } from '@playwright/test';

export interface Product {
  id: number;
  name: string;
  price: number;
}

export class CatalogueApi {
  constructor(private readonly api: APIRequestContext) {}

  async products(): Promise<Product[]> {
    const response = await this.api.get('rest/products/search?q=');
    if (!response.ok()) throw new Error(`The catalogue did not load: ${response.status()}.`);
    const { data } = (await response.json()) as { data: Product[] };
    return data.map(({ id, name, price }) => ({ id, name, price }));
  }

  /**
   * Products a run can order without running out: no limit per customer, the most stocked first.
   * Every order uses stock up, only a restart gives it back, and a start sets each product's stock
   * differently (app notes), so cases that do not care which product take one from here.
   */
  async stocked(): Promise<(Product & { stock: number })[]> {
    const response = await this.api.get('api/Quantitys/');
    if (!response.ok()) throw new Error(`The stock did not load: ${response.status()}.`);
    const { data } = (await response.json()) as {
      data: { ProductId: number; quantity: number; limitPerUser: number | null }[];
    };
    const products = new Map((await this.products()).map((p) => [p.id, p]));
    return data
      .filter((q) => q.limitPerUser === null && products.has(q.ProductId))
      .sort((a, b) => b.quantity - a.quantity)
      .map((q) => ({ ...(products.get(q.ProductId) as Product), stock: q.quantity }));
  }

  /** The first product with no stock left, whatever its limit. */
  async soldOut(): Promise<Product> {
    const response = await this.api.get('api/Quantitys/');
    if (!response.ok()) throw new Error(`The stock did not load: ${response.status()}.`);
    const { data } = (await response.json()) as {
      data: { ProductId: number; quantity: number }[];
    };
    const products = new Map((await this.products()).map((p) => [p.id, p]));
    const row = data.find((q) => q.quantity === 0 && products.has(q.ProductId));
    if (!row) throw new Error('The catalogue has no sold out product.');
    return products.get(row.ProductId) as Product;
  }

  /** A product's stock and its limit per customer (null when it has none). */
  async quantity(productId: number): Promise<{ stock: number; limitPerUser: number | null }> {
    const response = await this.api.get('api/Quantitys/');
    if (!response.ok()) throw new Error(`The stock did not load: ${response.status()}.`);
    const { data } = (await response.json()) as {
      data: { ProductId: number; quantity: number; limitPerUser: number | null }[];
    };
    const row = data.find((q) => q.ProductId === productId);
    if (!row) throw new Error(`Product ${productId} has no stock record.`);
    return { stock: row.quantity, limitPerUser: row.limitPerUser };
  }

  async product(name: string): Promise<Product> {
    const found = (await this.products()).find((p) => p.name === name);
    if (!found) throw new Error(`The catalogue has no product named "${name}".`);
    return found;
  }
}
