import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectTagFilter, TAGS } from '../lib/tags.mjs';

/** Whether a project with this filter runs a case whose grep text is `title`. */
function runs(filter, title) {
  if (filter.grep && !filter.grep.test(title)) return false;
  return !filter.grepInvert.test(title);
}

test('every tag is unique and starts with @', () => {
  assert.equal(new Set(TAGS).size, TAGS.length);
  assert.ok(TAGS.every((tag) => /^@[a-z][a-z0-9-]*$/.test(tag)));
});

test('desktop projects leave out @mobile-only, tablet and mobile ones leave out @desktop-only', () => {
  const desktop = projectTagFilter('desktop', {});
  assert.equal(runs(desktop, 'opens the cart @desktop-only'), true);
  assert.equal(runs(desktop, 'opens the cart @mobile-only'), false);
  for (const form of ['tablet', 'mobile']) {
    const touch = projectTagFilter(form, {});
    assert.equal(runs(touch, 'opens the cart @mobile-only'), true, form);
    assert.equal(runs(touch, 'opens the cart @desktop-only'), false, form);
  }
});

test('a plain run leaves out destructive, quarantined and visual cases, and keeps the rest', () => {
  const filter = projectTagFilter('desktop', {});
  assert.equal(filter.grep, undefined);
  for (const tag of ['@destructive', '@quarantine', '@visual']) {
    assert.equal(runs(filter, `case ${tag}`), false, tag);
  }
  for (const title of [
    'case @smoke @a11y',
    'case @visually-hidden-label',
    'case @destructive-looking',
  ]) {
    assert.equal(runs(filter, title), true, title);
  }
});

test('the destructive lane selects only destructive cases, never quarantined ones', () => {
  const filter = projectTagFilter('mobile', { QA_DESTRUCTIVE: '1' });
  assert.equal(runs(filter, 'deletes the account @destructive'), true);
  assert.equal(runs(filter, 'deletes the account @destructive @quarantine'), false);
  assert.equal(runs(filter, 'deletes the account @destructive @desktop-only'), false);
  assert.equal(runs(filter, 'opens the cart'), false);
});

test('the visual lane selects only visual cases', () => {
  const filter = projectTagFilter('desktop', { QA_VISUAL: '1' });
  assert.equal(runs(filter, 'product card @visual'), true);
  assert.equal(runs(filter, 'product card @visual @destructive'), false);
  assert.equal(runs(filter, 'opens the cart'), false);
});

test('the flake lane keeps quarantined cases', () => {
  const filter = projectTagFilter('desktop', { QA_INCLUDE_QUARANTINE: '1' });
  assert.equal(runs(filter, 'search @quarantine'), true);
  assert.equal(runs(filter, 'search @quarantine @visual'), false);
});
