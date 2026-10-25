// Reading specs through the TypeScript syntax tree instead of regular expressions, so a call inside
// a comment or a string is never mistaken for code. Linters and status reports share these helpers.

import ts from 'typescript';

export { ts };

const TEST_MODIFIERS = new Set(['only', 'skip', 'fixme', 'fail', 'slow']);
const DESCRIBE_MODIFIERS = new Set(['only', 'skip', 'fixme', 'serial', 'parallel']);
const HOOKS = new Set(['beforeAll', 'beforeEach', 'afterAll', 'afterEach']);

/** The text of a string literal, or null when the expression is computed. */
export function literalText(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

const TITLE_TAG = /(?:^|\s)(@[a-z][\w-]*)/g;

/** The tags a test or describe call declares, in its title or in its `{ tag }` details. */
export function tagsOf(call) {
  const title = literalText(call.arguments[0]) ?? '';
  const tags = new Set([...title.matchAll(TITLE_TAG)].map((match) => match[1]));
  for (const argument of call.arguments) {
    if (!ts.isObjectLiteralExpression(argument)) continue;
    for (const property of argument.properties) {
      if (!ts.isPropertyAssignment(property) || property.name.getText() !== 'tag') continue;
      const value = property.initializer;
      for (const element of ts.isArrayLiteralExpression(value) ? value.elements : [value]) {
        const text = literalText(element);
        if (text) tags.add(text);
      }
    }
  }
  return [...tags];
}

/**
 * What a call is to Playwright's `test`: `{ kind, modifier }` with kind `test`, `describe`, `hook`
 * or `other`. `test('t', fn)`, `test.skip('t', fn)`, `test.describe.serial('d', fn)` and
 * `test.beforeEach(fn)` are recognised; `test.skip(condition, reason)` inside a body is not a test.
 */
export function classifyCall(call) {
  const chain = [];
  let callee = call.expression;
  while (ts.isPropertyAccessExpression(callee)) {
    chain.unshift(callee.name.text);
    callee = callee.expression;
  }
  const other = { kind: 'other', modifier: null };
  if (!ts.isIdentifier(callee) || callee.text !== 'test') return other;
  const [first, second = null] = chain;
  if (first === undefined) return { kind: 'test', modifier: null };
  if (first === 'describe') {
    return second === null || DESCRIBE_MODIFIERS.has(second)
      ? { kind: 'describe', modifier: second }
      : other;
  }
  if (HOOKS.has(first)) return { kind: 'hook', modifier: first };
  if (chain.length === 1 && TEST_MODIFIERS.has(first)) {
    const declaresTest =
      literalText(call.arguments[0]) !== null && call.arguments.some((a) => ts.isFunctionLike(a));
    return { kind: declaresTest ? 'test' : 'other', modifier: first };
  }
  return other;
}
