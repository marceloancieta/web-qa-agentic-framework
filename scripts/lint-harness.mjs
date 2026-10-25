#!/usr/bin/env node
// Harness linter: defects in how a pack's code drives the browser and the runner, the kind that
// make a case flaky, brittle or pass without checking anything. Every rule reads the TypeScript
// syntax tree and names the exact shape it reports; anything computed is left alone.
//
// In specs, pages, components and flows (`apps/<pack>/{specs,pages,components,flows}/**`):
//   fixed-wait            `waitForTimeout(...)` or `setTimeout(...)`. Wait for what the user would
//                         see instead: a web-first assertion, a URL, a response.
// In every layer that builds locators (the same folders plus `mocks/`), on a literal selector
// passed to `locator`, `$`, `$$`, `$eval`, `$$eval`, `waitForSelector` or `frameLocator`:
//   xpath-locator         a selector that starts with `/`, `(/`, `..` or `xpath=` (ADR 0007).
//   positional-selector   `:nth-child(`, `:nth-of-type(`, `:nth-match(` or `nth=` in a selector,
//                         or a `.nth(...)` call, without a comment on its line or the two above
//                         saying why the position is the identity.
// In pages, components and flows:
//   css-without-reason    a literal selector passed to `locator(...)` without a comment on its
//                         line or the two above: role, label, test id or text come first.
//   text-without-exact    `getByText('<literal>')` without an `exact` option; a regular
//                         expression is a deliberate choice and passes.
// In specs (`apps/<pack>/specs/**/*.spec.ts`):
//   soft-before-arm       `expect.soft(...)` before `test.fail(...)` in the same test: the soft
//                         failure is recorded, then the arm turns the whole test into a pass.
//   optional-assertion    an assertion that only runs in one branch of an `if` whose other branch
//                         asserts nothing, or inside a `catch`; when the branch is not taken the
//                         case passes without checking anything. Device differences go in tags.
//   unknown-tag           a tag on a test or describe that the taxonomy (scripts/lib/tags.mjs)
//                         does not define.
//   layer-tag             a test without exactly one of @smoke, @sanity, @regression (on itself
//                         or on a describe around it).
//   destructive-isolation a @destructive test in a file that also declares tests without it; the
//                         destructive lane runs such a case alone, followed by the recovery.
//
// Usage:
//   node scripts/lint-harness.mjs [--root <dir>]   the repository, or another tree
//   node scripts/lint-harness.mjs --self-test      exact check against the fixture tree
// Exit codes: 0 clean; 1 findings or an inexact self-test; 2 the linter could not run.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './lib/cli.mjs';
import { classifyCall, literalText, tagsOf, ts } from './lib/corpus.mjs';
import { finding, report, selfTest } from './lib/lint.mjs';
import { DESTRUCTIVE_TAG, LAYER_TAGS, TAGS } from './lib/tags.mjs';

export const TOOL = 'lint-harness';
export const FIXTURES = join(import.meta.dirname, '__fixtures__', 'lint-harness');
export const RULES = [
  'fixed-wait',
  'xpath-locator',
  'positional-selector',
  'css-without-reason',
  'text-without-exact',
  'soft-before-arm',
  'optional-assertion',
  'unknown-tag',
  'layer-tag',
  'destructive-isolation',
];

const LAYER_FILE = /^apps\/[^/]+\/(specs|pages|components|flows|mocks)\/.+\.ts$/;
const SELECTOR_METHODS = new Set([
  'locator',
  '$',
  '$$',
  '$eval',
  '$$eval',
  'waitForSelector',
  'frameLocator',
]);
const XPATH = /^\s*(?:\(?\/|\.\.|xpath=)/;
const POSITIONAL = /:nth-(?:child|of-type|match)\(|\bnth=/;

function visit(node, fn) {
  fn(node);
  ts.forEachChild(node, (child) => visit(child, fn));
}

const methodOf = (call) =>
  ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : null;
const calleeName = (call) => (ts.isIdentifier(call.expression) ? call.expression.text : null);

/** Whether `expect(...)`, `expect.soft(...)` or `expect.poll(...)` starts this call chain. */
function isExpectCall(call) {
  let callee = call.expression;
  while (ts.isPropertyAccessExpression(callee)) callee = callee.expression;
  return ts.isIdentifier(callee) && callee.text === 'expect';
}

function containsExpect(node) {
  let found = false;
  visit(node, (child) => {
    if (ts.isCallExpression(child) && isExpectCall(child)) found = true;
  });
  return found;
}

function containsThrow(node) {
  let found = false;
  visit(node, (child) => {
    if (ts.isThrowStatement(child)) found = true;
  });
  return found;
}

/**
 * Whether a comment gives a reason for `node`: on its own line, or on one of the two lines above
 * (a comment over a getter sits above its signature). A self-test marker is not a reason.
 */
function hasReason(sourceFile, node) {
  const lines = sourceFile.getFullText().split(/\r?\n/);
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
  const own = /\/\/(.*)$/.exec(lines[line] ?? '')?.[1] ?? '';
  if (own.trim() && !own.trim().startsWith('expect-finding')) return true;
  return [lines[line - 1], lines[line - 2]].some((text) => /^\s*(?:\/\/|\*|\/\*)/.test(text ?? ''));
}

function layerRules(sourceFile, layer, add) {
  const locates = layer !== 'mocks';
  visit(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return;
    const method = methodOf(node);
    const name = calleeName(node);
    if (locates && (method === 'waitForTimeout' || name === 'setTimeout')) {
      add(
        'fixed-wait',
        node,
        `${method ?? name}() waits a fixed time; wait for what the user would see`,
      );
    }
    if (method && SELECTOR_METHODS.has(method)) {
      const selector = literalText(node.arguments[0]);
      if (selector !== null && XPATH.test(selector)) {
        add(
          'xpath-locator',
          node,
          `"${selector}" is XPath; locate by role, label, test id or text`,
        );
      } else if (selector !== null && POSITIONAL.test(selector) && !hasReason(sourceFile, node)) {
        add(
          'positional-selector',
          node,
          `"${selector}" locates by position; say why, or locate by identity`,
        );
      } else if (
        selector !== null &&
        method === 'locator' &&
        ['pages', 'components', 'flows'].includes(layer) &&
        !hasReason(sourceFile, node)
      ) {
        add(
          'css-without-reason',
          node,
          `CSS "${selector}" needs a comment saying why role, label, test id and text do not work`,
        );
      }
    }
    if (method === 'nth' && !hasReason(sourceFile, node)) {
      add('positional-selector', node, 'nth() locates by position; say why, or locate by identity');
    }
    if (
      method === 'getByText' &&
      literalText(node.arguments[0]) !== null &&
      ['pages', 'components', 'flows'].includes(layer)
    ) {
      const options = node.arguments[1];
      const exact =
        options &&
        ts.isObjectLiteralExpression(options) &&
        options.properties.some((property) => property.name?.getText() === 'exact');
      if (!exact)
        add('text-without-exact', node, 'getByText with a string needs a deliberate exact option');
    }
  });
}

/** The test calls of a spec, each with the tags of the describes around it. */
function testsOf(sourceFile) {
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
        tests.push({ call: node, tags: [...inherited, ...tagsOf(node)] });
        return;
      }
    }
    ts.forEachChild(node, (child) => walk(child, inherited));
  };
  walk(sourceFile, []);
  return tests;
}

function specRules(sourceFile, add) {
  const known = new Set(TAGS);
  visit(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return;
    const { kind } = classifyCall(node);
    if (kind !== 'test' && kind !== 'describe') return;
    for (const tag of tagsOf(node)) {
      if (!known.has(tag))
        add('unknown-tag', node, `${tag} is not in the tag taxonomy (scripts/lib/tags.mjs)`);
    }
  });

  const tests = testsOf(sourceFile);
  for (const { call, tags } of tests) {
    const layers = [...new Set(tags.filter((tag) => LAYER_TAGS.includes(tag)))];
    if (layers.length !== 1) {
      add(
        'layer-tag',
        call,
        `has ${layers.length ? layers.join(', ') : 'no layer tag'}; a case needs exactly one of ${LAYER_TAGS.join(', ')}`,
      );
    }
    const body = call.arguments.find((argument) => ts.isFunctionLike(argument));
    if (body) bodyRules(body, add);
  }
  const destructive = tests.filter(({ tags }) => tags.includes(DESTRUCTIVE_TAG));
  if (destructive.length > 0 && destructive.length < tests.length) {
    for (const { call } of destructive) {
      add(
        'destructive-isolation',
        call,
        'a @destructive case shares its file with other cases; move it to a file of its own',
      );
    }
  }
}

function bodyRules(body, add) {
  const softs = [];
  let armedAt = null;
  visit(body, (node) => {
    if (ts.isCallExpression(node)) {
      if (isExpectCall(node) && methodOf(node) === 'soft' && armedAt === null) softs.push(node);
      const { kind, modifier } = classifyCall(node);
      if (kind === 'other' && modifier === 'fail' && armedAt === null) armedAt = node;
    }
    if (ts.isIfStatement(node)) {
      const thenAsserts = containsExpect(node.thenStatement);
      const elseAsserts = node.elseStatement ? containsExpect(node.elseStatement) : false;
      if (thenAsserts !== elseAsserts) {
        add(
          'optional-assertion',
          node,
          'only one branch of this if asserts; when the other runs, nothing is checked',
        );
      }
    }
    if (
      ts.isCatchClause(node) &&
      containsExpect(node.block) &&
      !containsThrow(node.parent.tryBlock)
    ) {
      add(
        'optional-assertion',
        node,
        'an assertion in a catch runs only if the call throws; use expect(...).rejects',
      );
    }
  });
  if (armedAt) {
    for (const soft of softs) {
      add('soft-before-arm', soft, 'a soft assertion before test.fail() is swallowed by the arm');
    }
  }
}

/** Findings for one file, by its path relative to the tree root; at most one per line and rule. */
export function lintFile(text, file) {
  const match = LAYER_FILE.exec(file);
  if (!match) return [];
  const layer = match[1];
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const seen = new Map();
  const add = (rule, node, message) => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const key = `${line}:${rule}`;
    if (!seen.has(key)) seen.set(key, finding(rule, file, line, message));
  };
  layerRules(sourceFile, layer, add);
  if (layer === 'specs' && file.endsWith('.spec.ts')) specRules(sourceFile, add);
  return [...seen.values()];
}

function codeFiles(root, dir) {
  const here = join(root, dir);
  if (!existsSync(here)) return [];
  return readdirSync(here, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '__fixtures__'].includes(entry.name)) return [];
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return codeFiles(root, path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/** Every pack file under `root/apps`. */
export function lintHarness(root = REPO_ROOT) {
  return codeFiles(root, 'apps').flatMap((file) =>
    lintFile(readFileSync(join(root, file), 'utf8'), file),
  );
}

function main() {
  const { values } = parseArgs({
    options: { 'self-test': { type: 'boolean', default: false }, root: { type: 'string' } },
  });
  if (values['self-test']) {
    process.exitCode = selfTest(TOOL, FIXTURES, lintHarness(FIXTURES));
    return;
  }
  process.exitCode = report(TOOL, lintHarness(resolve(values.root ?? REPO_ROOT)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(`${TOOL}: ${error.message}`);
    process.exitCode = 2;
  }
}
