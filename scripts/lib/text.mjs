// Text helpers. Most are for text that leaves this repository for a renderer (test-management
// descriptions, tracker issues). Renderers change text: Markdown reads a bare `<petId>` as an HTML
// tag and drops it. Text is made safe before it is sent, and what was rendered is checked after.

const PLACEHOLDER = /<([A-Za-z][\w.-]*)>/g;

/** Wrap `<placeholder>` tokens of prose in code spans; existing code spans are left alone. */
export function codeSpanPlaceholders(markdown) {
  return markdown
    .split(/(`[^`]*`)/)
    .map((part) => (part.startsWith('`') ? part : part.replace(PLACEHOLDER, '`<$1>`')))
    .join('');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

/** `text` with every regular-expression metacharacter escaped, to match it literally. */
export function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Visible text of an HTML fragment: tags removed, common entities decoded. Tags are removed until
 * none is left, so a nested one such as `<sc<x>ript>` cannot reassemble.
 */
export function htmlToText(html) {
  let text = String(html ?? '');
  for (let previous = null; text !== previous;) {
    previous = text;
    text = text.replace(/<[^>]+>/g, '');
  }
  return text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name) => ENTITIES[name]);
}

/** Placeholders of the source that the rendered text no longer shows. */
export function lostPlaceholders(source, renderedText) {
  const wanted = [...new Set([...String(source).matchAll(PLACEHOLDER)].map((m) => m[0]))];
  return wanted.filter((token) => !renderedText.includes(token));
}

const COMMENT_OPEN = '<!--';
const COMMENT_CLOSE = '-->';

/**
 * One line of Markdown without its HTML comments: each `<!--` up to the first `-->` after it goes;
 * a `<!--` that is never closed stays. Comments are found by position rather than by a pattern, so
 * the time is linear in the line whatever it holds. Nothing here makes text safe for a browser: the
 * result is parsed, never rendered.
 */
export function withoutHtmlComments(line) {
  let kept = '';
  let rest = String(line);
  for (;;) {
    const open = rest.indexOf(COMMENT_OPEN);
    const close = open === -1 ? -1 : rest.indexOf(COMMENT_CLOSE, open + COMMENT_OPEN.length);
    if (close === -1) return kept + rest;
    kept += rest.slice(0, open);
    rest = rest.slice(close + COMMENT_CLOSE.length);
  }
}

/** A line without the HTML comment that ends it, and the spaces before that comment. */
function withoutTrailingComment(line) {
  if (!line.endsWith(COMMENT_CLOSE)) return line;
  const open = line.indexOf(COMMENT_OPEN);
  if (open === -1 || open + COMMENT_OPEN.length > line.length - COMMENT_CLOSE.length) return line;
  return line.slice(0, open).trimEnd();
}

/**
 * The cells of a Markdown table row: `| a | b |` -> ['a', 'b']. An escaped pipe stays inside its
 * cell, and an HTML comment after the last pipe is a reviewer's note, not a cell.
 */
export function tableCells(line) {
  const inner = withoutTrailingComment(String(line).trim()).replace(/^\|/, '').replace(/\|$/, '');
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

/** Text normalized for a read-back comparison: line endings, trailing spaces, outer blank lines. */
export function normalizeText(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .trim();
}
