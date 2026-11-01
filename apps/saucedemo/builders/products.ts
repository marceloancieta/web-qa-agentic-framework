// Products the cases use. The application builds its six products into its script, so their ids
// and texts are the application's own data, not data a case creates.

export interface Product {
  /** The id the product page and the cart in local storage use. */
  id: number;
  name: string;
}

export const BACKPACK: Product = { id: 4, name: 'Sauce Labs Backpack' };
export const BIKE_LIGHT: Product = { id: 0, name: 'Sauce Labs Bike Light' };

/** How many products the list shows. */
export const PRODUCT_COUNT = 6;

/** "$29.99" as a number, to compare prices. */
export function priceValue(text: string): number {
  const value = Number(text.replace(/^\$/, ''));
  if (Number.isNaN(value)) throw new Error(`"${text}" is not a price`);
  return value;
}
