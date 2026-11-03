import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTextIfExists, REPO_ROOT } from '../lib/cli.mjs';
import { escapeRegExp, tableCells, withoutHtmlComments } from '../lib/text.mjs';

test('readTextIfExists reads a file, answers null for a missing one and rethrows other errors', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cli-read-'));
  writeFileSync(join(dir, 'a.txt'), 'content');
  assert.equal(readTextIfExists(join(dir, 'a.txt')), 'content');
  assert.equal(readTextIfExists(join(dir, 'missing.txt')), null);
  assert.throws(
    () => readTextIfExists(dir),
    (error) => error.code !== 'ENOENT',
  );
});

test('REPO_ROOT is the directory that holds package.json', () => {
  assert.ok(existsSync(join(REPO_ROOT, 'package.json')));
});

test('escapeRegExp makes every metacharacter literal', () => {
  const raw = 'price.(usd)*2+tax? [eu]^{n}$|C:\\tmp';
  assert.ok(new RegExp(`^${escapeRegExp(raw)}$`).test(raw));
  assert.equal(new RegExp(escapeRegExp('a.c')).test('abc'), false);
});

test('withoutHtmlComments drops each closed comment of a line and keeps an unclosed one', () => {
  assert.equal(withoutHtmlComments('| a | `abc1234` <!-- note --> |'), '| a | `abc1234`  |');
  assert.equal(withoutHtmlComments('x <!-- one --> y <!-- two --> z'), 'x  y  z');
  assert.equal(withoutHtmlComments('x <!-- a <!-- b --> y'), 'x  y');
  assert.equal(withoutHtmlComments('x <!-- open'), 'x <!-- open');
  assert.equal(withoutHtmlComments('x <!-->'), 'x <!-->');
  assert.equal(withoutHtmlComments('no comment'), 'no comment');
});

test('tableCells drops only a comment that ends the row', () => {
  assert.deepEqual(tableCells('| a | b |  <!-- expect-finding: x -->'), ['a', 'b']);
  assert.deepEqual(tableCells('| a <!-- kept --> | b |'), ['a <!-- kept -->', 'b']);
  assert.deepEqual(tableCells('| a | b \\| c |'), ['a', 'b | c']);
  assert.deepEqual(tableCells('| a | <!-->'), ['a', '<!-->']);
});
