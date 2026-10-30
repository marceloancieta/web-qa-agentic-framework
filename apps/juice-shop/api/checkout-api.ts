// What the checkout writes and reads: a customer's addresses and cards, and the orders. Cases that
// are not about the address or card form arrange them here, and every case that claims a write
// reads it back here.

import type { APIRequestContext } from '@playwright/test';
import type { Address } from '../builders/address-builder';
import type { Card } from '../builders/card-builder';

export interface SavedAddress extends Address {
  id: number;
}

export interface SavedCard {
  id: number;
  fullName: string;
  /** As the server answers it: masked but for the last four digits. */
  cardNum: string;
  expMonth: number;
  expYear: number;
}

export interface Order {
  orderId: string;
  totalPrice: number;
  deliveryPrice: number;
  addressId: string | null;
  paymentId: string | null;
  products: { name: string; price: number; quantity: number }[];
}

async function data<T>(response: Awaited<ReturnType<APIRequestContext['get']>>, what: string) {
  if (!response.ok()) throw new Error(`${what} failed: ${response.status()}.`);
  return ((await response.json()) as { data: T }).data;
}

export class CheckoutApi {
  constructor(private readonly api: APIRequestContext) {}

  async addAddress(address: Address): Promise<SavedAddress> {
    return data<SavedAddress>(
      await this.api.post('api/Addresss/', { data: address }),
      'Saving an address',
    );
  }

  async addresses(): Promise<SavedAddress[]> {
    return data<SavedAddress[]>(await this.api.get('api/Addresss'), 'Reading the addresses');
  }

  async addCard(card: Card): Promise<SavedCard> {
    return data<SavedCard>(await this.api.post('api/Cards/', { data: card }), 'Saving a card');
  }

  async cards(): Promise<SavedCard[]> {
    return data<SavedCard[]>(await this.api.get('api/Cards'), 'Reading the cards');
  }

  /** The delivery methods with their price and expected days. */
  async deliveryMethods(): Promise<{ id: number; name: string; price: number; eta: number }[]> {
    return data(await this.api.get('api/Deliverys'), 'Reading the delivery methods');
  }

  /**
   * Place the order of a basket, as the summary's Place your order does, for cases about what
   * follows it; returns the order id.
   */
  async placeOrder(
    basketId: number,
    details: { addressId: number; paymentId: number; deliveryMethodId: number },
  ): Promise<string> {
    const response = await this.api.post(`rest/basket/${basketId}/checkout`, {
      data: { orderDetails: details },
    });
    if (!response.ok()) throw new Error(`Placing the order failed: ${response.status()}.`);
    return ((await response.json()) as { orderConfirmation: string }).orderConfirmation;
  }

  /** The signed-in customer's orders. */
  async orders(): Promise<Order[]> {
    return data<Order[]>(await this.api.get('rest/order-history'), 'Reading the order history');
  }

  /** The answer to tracking an order, as anyone holding its id would get it. */
  async track(orderId: string): Promise<{ status: number; orders: Order[] }> {
    const response = await this.api.get(`rest/track-order/${encodeURIComponent(orderId)}`);
    const body = response.ok() ? ((await response.json()) as { data?: Order[] }) : {};
    return { status: response.status(), orders: body.data ?? [] };
  }
}
