// A table row is named after its cells, in order. A product row starts with the product's name, so
// it is matched by that start, never by a substring another product's name could contain.

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const rowStartingWith = (first: string): RegExp => new RegExp(`^${escape(first)} `);
