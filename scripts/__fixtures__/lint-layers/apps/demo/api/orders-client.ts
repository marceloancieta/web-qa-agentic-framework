import { expect, request, type APIRequestContext } from '@playwright/test';

// The api/ layer is where HTTP belongs; none of the spec rules apply here.
export class OrdersClient {
  constructor(private readonly api: APIRequestContext) {}

  async list(): Promise<unknown[]> {
    const response = await this.api.get('/api/orders');
    expect(response.ok()).toBe(true);
    return response.json();
  }

  static async anonymous(baseURL: string): Promise<APIRequestContext> {
    await fetch(`${baseURL}/health`);
    return request.newContext({ baseURL });
  }
}
