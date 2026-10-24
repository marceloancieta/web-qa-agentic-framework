#!/usr/bin/env node
// Layer linter: the boundaries of ADR 0005, read through the TypeScript syntax tree. Each rule names
// the exact shape it reports and stays quiet on anything computed, so it never guesses.
//
//   core-imports-pack
//     A core file (`helpers/`, `fixtures/` or `scripts/`, outside `__fixtures__/`) whose literal
//     relative import resolves into `apps/`: `import`, `export ... from`, `import()` or
//     `require()`. The core serves every pack and knows none of them; it reads pack files by path.
//   spec-builds-locator
//     A spec (`apps/<pack>/specs/**/*.spec.ts`) that calls a method building a locator or querying
//     the DOM: `locator`, the `getBy*` family, `frameLocator`, `$`, `$$`, `$eval`, `$$eval`,
//     `waitForSelector`. Locators belong to page objects and components, which the spec asserts on.
//   spec-routes-network
//     A spec that calls `route`, `routeFromHAR`, `routeWebSocket` or `unroute`. Network handlers
//     belong to the pack's `mocks/`, which the spec calls by name.
//   spec-sends-request
//     A spec that sends HTTP itself: the `request` fixture destructured in a test or hook, `request`
//     imported from `@playwright/test`, an HTTP package, a call to `fetch` in a file that declares
//     no `fetch` of its own, or `request.newContext()` (also as `<x>.request.newContext()`). State
//     is prepared and checked through the pack's `api/` clients.
//   page-object-asserts
//     A page object, component or flow (`apps/<pack>/{pages,components,flows}/**`) that imports
//     `expect` from `@playwright/test` or calls `expect(...)`. They locate and act; assertions stay
//     in specs, where they retry.
//
// Usage:
//   node scripts/lint-layers.mjs [--root <dir>]   the repository, or another tree
//   node scripts/lint-layers.mjs --self-test      exact check against the fixture tree
// Exit codes: 0 clean; 1 findings or an inexact self-test; 2 the linter could not run.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './lib/cli.mjs';
import { classifyCall, literalText, ts } from './lib/corpus.mjs';
import { finding, report, selfTest } from './lib/lint.mjs';

export const TOOL = 'lint-layers';
export const FIXTURES = join(import.meta.dirname, '__fixtures__', 'lint-layers');
export const RULES = [
  'core-imports-pack',
  'spec-builds-locator',
  'spec-routes-network',
  'spec-sends-request',
  'page-object-asserts',
];

const CORE_DIRS = ['helpers', 'fixtures', 'scripts'];
const CODE_FILE = /\.(?:ts|mts|cts|js|mjs|cjs)$/;
const SPEC_FILE = /^apps\/[^/]+\/specs\/.+\.spec\.ts$/;
const PAGE_LAYER_FILE = /^apps\/[^/]+\/(?:pages|components|flows)\/.+\.ts$/;
const LOCATOR_METHODS = new Set([
  'locator',
  'getByRole',
  'getByLabel',
  'getByText',
  'getByTestId',
  'getByPlaceholder',
  'getByAltText',
  'getByTitle',
  'frameLocator',
  '$',
  '$$',
  '$eval',
  '$$eval',
  'waitForSelector',
]);
const ROUTING_METHODS = new Set(['route', 'routeFromHAR', 'routeWebSocket', 'unroute']);
const HTTP_PACKAGES = new Set([
  'axios',
  'got',
  'node-fetch',
  'undici',
  'superagent',
  'ky',
  'http',
  'https',
  'node:http',
  'node:https',
]);

/** Code files under `root/dir`, as forward-slash paths relative to `root`. */
function codeFiles(root, dir) {
  const here = join(root, dir);
  if (!existsSync(here)) return [];
  return readdirSync(here, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '__fixtures__', '.git'].includes(entry.name)) return [];
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return codeFiles(root, path);
    return CODE_FILE.test(entry.name) ? [path] : [];
  });
}

function visit(node, fn) {
  fn(node);
  ts.forEachChild(node, (child) => visit(child, fn));
}

/** Every literal module specifier in a file, with the node that holds it. */
function moduleSpecifiers(sourceFile) {
  const found = [];
  visit(sourceFile, (node) => {
    const declaration = ts.isImportDeclaration(node) || ts.isExportDeclaration(node);
    if (declaration && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push({ node, specifier: node.moduleSpecifier.text });
      return;
    }
    if (!ts.isCallExpression(node)) return;
    const dynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
    const required = ts.isIdentifier(node.expression) && node.expression.text === 'require';
    const specifier = literalText(node.arguments[0]);
    if ((dynamicImport || required) && specifier !== null) found.push({ node, specifier });
  });
  return found;
}

/** Names bound from `@playwright/test` imports, by imported name. */
function playwrightImports(sourceFile) {
  const imports = [];
  visit(sourceFile, (node) => {
    if (!ts.isImportSpecifier(node)) return;
    const declaration = node.parent.parent.parent;
    if (literalText(declaration.moduleSpecifier) !== '@playwright/test') return;
    imports.push({ node, imported: (node.propertyName ?? node.name).text });
  });
  return imports;
}

/** Names the file declares itself: functions, variables, parameters and import bindings. */
function declaredNames(sourceFile) {
  const names = new Set();
  visit(sourceFile, (node) => {
    const declares =
      ts.isFunctionDeclaration(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isImportSpecifier(node) ||
      ts.isImportClause(node) ||
      ts.isNamespaceImport(node);
    if (declares && node.name && ts.isIdentifier(node.name)) names.add(node.name.text);
  });
  return names;
}

/** The name of the method a call invokes (`a.b.locator(...)` is `locator`), or null. */
function calledMethod(call) {
  const callee = call.expression;
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
}

function coreImportsPack(sourceFile, file, add) {
  for (const { node, specifier } of moduleSpecifiers(sourceFile)) {
    if (!specifier.startsWith('.')) continue;
    const target = posix.normalize(posix.join(posix.dirname(file), specifier));
    if (target === 'apps' || target.startsWith('apps/')) {
      add(
        'core-imports-pack',
        node,
        `imports "${specifier}" from an app pack; the core reads pack files by path, never by import`,
      );
    }
  }
}

function specRules(sourceFile, add) {
  const viaClients = "prepare and check state through the pack's api/ clients";
  for (const { node, specifier } of moduleSpecifiers(sourceFile)) {
    if (HTTP_PACKAGES.has(specifier)) {
      add('spec-sends-request', node, `imports "${specifier}"; ${viaClients}`);
    }
  }
  for (const { node, imported } of playwrightImports(sourceFile)) {
    if (imported === 'request') {
      add('spec-sends-request', node, `imports the Playwright request API; ${viaClients}`);
    }
  }
  const declared = declaredNames(sourceFile);
  visit(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return;
    const method = calledMethod(node);
    if (method && LOCATOR_METHODS.has(method)) {
      add(
        'spec-builds-locator',
        node,
        `calls ${method}(); locators belong to page objects and components`,
      );
    }
    if (method && ROUTING_METHODS.has(method)) {
      add('spec-routes-network', node, `calls ${method}(); call a handler of the pack's mocks/`);
    }
    if (method === 'newContext') {
      // `request.newContext()` or `<x>.request.newContext()`; `browser.newContext()` is a page.
      const owner = node.expression.expression;
      const ownerName = ts.isPropertyAccessExpression(owner) ? owner.name : owner;
      if (ts.isIdentifier(ownerName) && ownerName.text === 'request') {
        add('spec-sends-request', node, `opens a request context; ${viaClients}`);
      }
    }
    const callee = node.expression;
    if (ts.isIdentifier(callee) && callee.text === 'fetch' && !declared.has('fetch')) {
      add('spec-sends-request', node, `calls fetch(); ${viaClients}`);
    }
    const { kind } = classifyCall(node);
    if (kind !== 'test' && kind !== 'hook') return;
    for (const callback of node.arguments.filter((argument) => ts.isFunctionLike(argument))) {
      const fixtures = callback.parameters[0]?.name;
      if (!fixtures || !ts.isObjectBindingPattern(fixtures)) continue;
      for (const element of fixtures.elements) {
        const name = element.propertyName ?? element.name;
        if (ts.isIdentifier(name) && name.text === 'request') {
          add('spec-sends-request', element, `uses the request fixture; ${viaClients}`);
        }
      }
    }
  });
}

function pageObjectAsserts(sourceFile, add) {
  const reason = 'page objects, components and flows locate and act; assert in the spec';
  for (const { node, imported } of playwrightImports(sourceFile)) {
    if (imported === 'expect') add('page-object-asserts', node, `imports expect; ${reason}`);
  }
  visit(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return;
    let callee = node.expression;
    while (ts.isPropertyAccessExpression(callee)) callee = callee.expression;
    if (ts.isIdentifier(callee) && callee.text === 'expect') {
      add('page-object-asserts', node, `calls expect(); ${reason}`);
    }
  });
}

/** Findings for one file, by its path relative to the tree root; at most one per line and rule. */
export function lintFile(text, file) {
  const core = CORE_DIRS.includes(file.split('/')[0]);
  const spec = SPEC_FILE.test(file);
  const pageLayer = PAGE_LAYER_FILE.test(file);
  if (!core && !spec && !pageLayer) return [];
  const kind = /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const seen = new Map();
  const add = (rule, node, message) => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const key = `${line}:${rule}`;
    if (!seen.has(key)) seen.set(key, finding(rule, file, line, message));
  };
  if (core) coreImportsPack(sourceFile, file, add);
  if (spec) specRules(sourceFile, add);
  if (pageLayer) pageObjectAsserts(sourceFile, add);
  return [...seen.values()];
}

/** Every core file, spec, page object, component and flow under `root`. */
export function lintLayers(root = REPO_ROOT) {
  return [...CORE_DIRS, 'apps']
    .flatMap((dir) => codeFiles(root, dir))
    .flatMap((file) => lintFile(readFileSync(join(root, file), 'utf8'), file));
}

function main() {
  const { values } = parseArgs({
    options: { 'self-test': { type: 'boolean', default: false }, root: { type: 'string' } },
  });
  if (values['self-test']) {
    process.exitCode = selfTest(TOOL, FIXTURES, lintLayers(FIXTURES));
    return;
  }
  process.exitCode = report(TOOL, lintLayers(resolve(values.root ?? REPO_ROOT)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(`${TOOL}: ${error.message}`);
    process.exitCode = 2;
  }
}
