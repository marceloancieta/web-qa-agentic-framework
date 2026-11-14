// The admin API's products (`/api/v3/admin/products`), read with the session of the client's
// member, for the cases that need a product of the sample data by name.

import type { APIRequestContext } from '@playwright/test';

export class CatalogApi {
  constructor(private readonly api: APIRequestContext) {}

  /**
   * The names of the store's products. The dashboard's list and the API order them differently,
   * and the order drifts as background jobs update products (docs/app-notes.md), so a case matches
   * a row against the whole set rather than one name.
   */
  async productNames(): Promise<string[]> {
    const response = await this.api.get('api/v3/admin/products', { params: { per_page: 100 } });
    if (!response.ok()) throw new Error(`Spree products answered ${response.status()}.`);
    const { data } = (await response.json()) as { data: { name: string }[] };
    if (data.length === 0) throw new Error('The store has no product: load the sample data.');
    return data.map(({ name }) => name);
  }
}
