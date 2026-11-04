import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { limitNote, packsToCheck } from '../app-map-drift.mjs';
import {
  driftLines,
  driftMarkdown,
  mapDrift,
  routeChanges,
  withoutCount,
} from '../lib/app-map-drift.mjs';

const fixture = (name) =>
  JSON.parse(
    readFileSync(join(import.meta.dirname, '..', '__fixtures__', 'app-map-drift', name), 'utf8'),
  );
const tracked = fixture('tracked.json');

test('a removed route, a renamed element and a changed constraint are drift', () => {
  assert.deepEqual(mapDrift(tracked, fixture('drifted.json')), [
    { route: '/#/', change: 'element removed: button "Add to Basket"' },
    { route: '/#/', change: 'element added: button "Add to Cart"' },
    { route: '/#/about', change: 'route removed' },
    { route: '/#/contact', change: 'route added' },
    { route: '/#/register', change: 'title "Shop" -> "Shop - Sign up"' },
    { route: '/#/register', change: 'field input "Email": type "email" -> "text"' },
    { route: '/#/register', change: 'field input "Password": minlength "5" -> "8"' },
  ]);
});

test('reordered entries, repeat counts, endpoints, links and bookkeeping are not drift', () => {
  // The look-alike reorders every list and the constraints' keys, shows 9 products instead of 12,
  // and differs in api_calls, links, blocked_writes and app_version.
  assert.deepEqual(mapDrift(tracked, fixture('look-alike.json')), []);
  assert.deepEqual(mapDrift(tracked, tracked), []);
});

test('a repeat count is dropped only after the closing quote of the name', () => {
  assert.equal(withoutCount('button "Add to Basket" x15'), 'button "Add to Basket"');
  assert.equal(withoutCount('button "Buy x2"'), 'button "Buy x2"');
  assert.equal(withoutCount('textbox ""'), 'textbox ""');
});

test('landmarks and headings count by name; a constraint that appears or goes is drift', () => {
  const before = {
    landmarks: ['main', 'navigation "Main"'],
    headings: ['h1 Login'],
    fields: [
      { tag: 'input', type: 'password', label: 'Password', constraints: { required: true } },
    ],
  };
  const after = {
    landmarks: ['main', 'navigation "Primary"'],
    headings: ['h2 Login'],
    fields: [
      { tag: 'input', type: 'password', label: 'Password', constraints: { minlength: '8' } },
    ],
  };
  assert.deepEqual(routeChanges(before, after), [
    'landmark removed: navigation "Main"',
    'landmark added: navigation "Primary"',
    'heading removed: h1 Login',
    'heading added: h2 Login',
    'field input "Password": minlength (none) -> "8", required true -> (none)',
  ]);
});

test('a relabelled field is one removed and one added; fields sharing a label are matched', () => {
  const field = (label, constraints = {}, type = 'text') => ({
    tag: 'input',
    type,
    label,
    constraints,
  });
  assert.deepEqual(routeChanges({ fields: [field('Email')] }, { fields: [field('E-mail')] }), [
    'field added: input "E-mail" {"type":"text"}',
    'field removed: input "Email" {"type":"text"}',
  ]);
  // Two unlabelled fields: one keeps its description, the other changes type.
  assert.deepEqual(
    routeChanges(
      { fields: [field(''), field('', {}, 'number')] },
      { fields: [field('', {}, 'search'), field('')] },
    ),
    ['field removed: input "" {"type":"number"}', 'field added: input "" {"type":"search"}'],
  );
  assert.deepEqual(
    routeChanges(
      { fields: [field(''), field('', {}, 'number')] },
      { fields: [field('', {}, 'number'), field('')] },
    ),
    [],
  );
});

test('the drift reads as aligned lines and as a Markdown section', () => {
  const changes = mapDrift(tracked, fixture('drifted.json'));
  const lines = driftLines(changes);
  assert.equal(lines[0], `  ${'/#/'.padEnd(11)}  element removed: button "Add to Basket"`);
  assert.equal(lines[2], `  ${'/#/about'.padEnd(11)}  route removed`);
  const markdown = driftMarkdown({ pack: 'shop', baseUrl: 'http://shop.test', routes: 3, changes });
  assert.match(markdown, /^### shop\n\nMapped at http:\/\/shop\.test\./);
  assert.match(markdown, /7 differences from the tracked map:/);
  assert.match(markdown, /\| `\/#\/about` \| route removed \|/);
  const piped = driftMarkdown({
    pack: 'shop',
    baseUrl: 'http://shop.test',
    routes: 1,
    changes: [{ route: '/a|b', change: 'element added: link "x | y"' }],
  });
  assert.match(piped, /1 difference from the tracked map:/);
  assert.match(piped, /\| `\/a\\\|b` \| element added: link "x \\\| y" \|/);
  // A backslash before a pipe would otherwise cancel the pipe's escape and split the cell.
  const slashed = driftMarkdown({
    pack: 'shop',
    baseUrl: 'http://shop.test',
    routes: 1,
    changes: [{ route: '/a', change: 'element added: link "x \\| y"' }],
  });
  assert.ok(slashed.includes('link "x \\\\\\| y" |'), slashed);
  assert.match(
    driftMarkdown({ pack: 'shop', baseUrl: 'http://shop.test', routes: 3, changes: [] }),
    /No drift: 3 routes match the tracked map\./,
  );
  assert.match(
    driftMarkdown({ pack: 'shop', baseUrl: 'http://shop.test', routes: 1, changes: [] }),
    /No drift: 1 route matches the tracked map\./,
  );
  assert.match(
    driftMarkdown({
      pack: 'shop',
      baseUrl: 'http://shop.test',
      error: 'net::ERR_CONNECTION_REFUSED',
    }),
    /Could not be mapped: net::ERR_CONNECTION_REFUSED/,
  );
});

test('the packs come from the environment, and one it does not name is refused', () => {
  const packs = { 'juice-shop': {}, saucedemo: {} };
  assert.deepEqual(packsToCheck([], packs), ['juice-shop', 'saucedemo']);
  assert.deepEqual(packsToCheck(['saucedemo', 'saucedemo'], packs), ['saucedemo']);
  assert.throws(
    () => packsToCheck(['saucedemo'], { 'juice-shop': {} }),
    /no entry for saucedemo; configured: juice-shop/,
  );
});

test('a walk that reached its page limit says so', () => {
  assert.equal(limitNote(24, 25), null);
  assert.match(limitNote(25, 25), /stopped at --max-pages 25/);
});
