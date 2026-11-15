// The admin API's products (`/api/v3/admin/products`), read with the session of the client's
// member, for the cases that need a product of the sample data by name.

import type { APIRequestContext } from '@playwright/test';

/** More pages than the sample data's 38 products fill; a store with more is not a test store. */
const MAX_PAGES = 20;

export class CatalogApi {
  constructor(private readonly api: APIRequestContext) {}

  /**
   * The names of the store's products. The dashboard's list and the API order them differently,
   * and the order drifts as background jobs update products (docs/app-notes.md), so a case matches
   * a row against the whole set rather than one name.
   */
  async productNames(): Promise<string[]> {
    // The list comes in pages whatever size is asked for: read them until one comes back empty.
    const names: string[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const response = await this.api.get('api/v3/admin/products', { params: { page } });
      if (!response.ok()) throw new Error(`Spree products answered ${response.status()}.`);
      const { data } = (await response.json()) as { data: { name: string }[] };
      if (data.length === 0) break;
      names.push(...data.map(({ name }) => name));
    }
    if (names.length === 0) throw new Error('The store has no product: load the sample data.');
    return names;
  }
}
