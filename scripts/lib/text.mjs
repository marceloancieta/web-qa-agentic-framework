// Text helpers shared by the scripts.

/** `text` with every regular-expression metacharacter escaped, to match it literally. */
export function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
