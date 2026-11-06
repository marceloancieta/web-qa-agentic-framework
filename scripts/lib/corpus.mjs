// Reading specs through the TypeScript syntax tree instead of regular expressions, so a call inside
// a comment or a string is never mistaken for code. Linters and status reports share these helpers.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

export { ts };

const CASE_ID = /^(TC-[A-Z][A-Z0-9]*-\d{2,3})\b/;

/**
 * The tests a spec declares, in source order: `{ call, title, id, tags }`, where `tags` include
 * those of the describes around the test and `id` is the case id the title starts with, or null.
 */
export function testsIn(sourceFile) {
  const tests = [];
  const walk = (node, inherited) => {
    if (ts.isCallExpression(node)) {
      const { kind } = classifyCall(node);
      if (kind === 'describe') {
        const tags = [...inherited, ...tagsOf(node)];
        node.arguments.forEach((argument) => walk(argument, tags));
        return;
      }
      if (kind === 'test') {
        const title = literalText(node.arguments[0]) ?? '';
        tests.push({
          call: node,
          title,
          id: CASE_ID.exec(title)?.[1] ?? null,
          tags: [...new Set([...inherited, ...tagsOf(node)])],
        });
        return;
      }
    }
    ts.forEachChild(node, (child) => walk(child, inherited));
  };
  walk(sourceFile, []);
  return tests;
}

/** The spec files under `dir`, as paths that start with `rel`. */
export function specFilesUnder(dir, rel) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return specFilesUnder(path, `${rel}/${entry.name}`);
    return entry.name.endsWith('.spec.ts') ? [`${rel}/${entry.name}`] : [];
  });
}

/** Every test of every pack's specs (or one pack's): `{ pack, file, line, title, id, tags }`. */
export function specCases(root, pack = null) {
  const apps = join(root, 'apps');
  if (!existsSync(apps)) return [];
  const packs = pack
    ? [pack]
    : readdirSync(apps, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
  return packs.sort().flatMap((name) =>
    specFilesUnder(join(apps, name, 'specs'), `apps/${name}/specs`).flatMap((file) => {
      const text = readFileSync(join(root, file), 'utf8');
      const sourceFile = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      return testsIn(sourceFile).map(({ call, title, id, tags }) => ({
        pack: name,
        file,
        line: sourceFile.getLineAndCharacterOfPosition(call.getStart(sourceFile)).line + 1,
        title,
        id,
        tags,
      }));
    }),
  );
}

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
