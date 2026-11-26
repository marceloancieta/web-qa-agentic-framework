import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findingsOf, parseSheet, sessionIdOf, stampSheet, timeBox } from '../lib/session-sheet.mjs';

const FILE = 'apps/shop/docs/sessions/2026-11-26-cart-badge.md';
const CHARTER = `---
mission: Find where the cart badge and the cart disagree
pack: shop
environment: local
routes:
  - /inventory
role: customer
device: desktop-chromium
driver: agent
writes: none
out_of_bounds:
  - the checkout forms
minutes: 30
---
`;
const FINDING = `### F1. The badge keeps a removed item
- Steps: open \`<base_url>/inventory\`, add two items, remove one from the cart
- Expected: the badge shows 1
- Seen: the badge shows 2 until the page reloads
- Device: desktop-chromium
- Role: customer
- Reproduced: 2 of 2
- Evidence: \`reports/explore/2026-11-26-cart-badge/trace-01.zip\`, at 00:04
`;
const sheet = (front, body = `\n# Cart badge\n\n## Findings\n\n${FINDING}`) => `${front}${body}`;
const messages = (text, file = FILE) => parseSheet(text, file).problems.map((p) => p.message);

test('a complete sheet has no problems and yields its charter', () => {
  const { id, charter, problems } = parseSheet(sheet(CHARTER), FILE);
  assert.deepEqual(problems, []);
  assert.equal(id, '2026-11-26-cart-badge');
  assert.equal(charter.role, 'customer');
  assert.equal(charter.minutes, 30);
});

test('the sheet lives in a pack sessions folder under a dated name', () => {
  assert.match(messages(sheet(CHARTER), 'apps/shop/docs/2026-11-26-x.md')[0], /lives at apps/);
  assert.match(
    messages(sheet(CHARTER), 'apps/shop/docs/sessions/cart.md')[0],
    /named <yyyy-mm-dd>-<slug>/,
  );
  assert.equal(sessionIdOf('apps\\shop\\docs\\sessions\\2026-11-26-a.md'), '2026-11-26-a');
  assert.equal(sessionIdOf('docs/other.md'), null);
});

test('every charter key is required', () => {
  const found = messages(sheet(CHARTER.replace(/^role: customer\n/m, '')));
  assert.deepEqual(found, ['the charter needs `role`']);
});

test('charter values are checked, each at its own line', () => {
  const bad = CHARTER.replace('pack: shop', 'pack: other')
    .replace('environment: local', 'environment: production')
    .replace('  - /inventory', '  - inventory')
    .replace('driver: agent', 'driver: robot')
    .replace('writes: none', 'writes: some')
    .replace('out_of_bounds:\n  - the checkout forms', 'out_of_bounds: checkout');
  const { problems } = parseSheet(sheet(bad), FILE);
  const byLine = Object.fromEntries(problems.map((p) => [p.line, p.message]));
  assert.match(byLine[3], /folder of shop/);
  assert.match(byLine[4], /looks like production/);
  assert.match(byLine[5], /each starting with \//);
  assert.match(byLine[9], /person, agent, both/);
  assert.match(byLine[10], /none, allowed/);
  assert.match(byLine[11], /is a list/);
});

test('the time box depends on who drives', () => {
  assert.deepEqual(timeBox('person'), { preset: 60, most: 90 });
  assert.deepEqual(timeBox('agent'), { preset: 30, most: 60 });
  assert.deepEqual(timeBox('both'), { preset: 30, most: 60 });
  assert.deepEqual(messages(sheet(CHARTER.replace('minutes: 30', 'minutes: 60'))), []);
  assert.match(messages(sheet(CHARTER.replace('minutes: 30', 'minutes: 61')))[0], /60 at most/);
  const person = CHARTER.replace('driver: agent', 'driver: person').replace(
    'minutes: 30',
    'minutes: 90',
  );
  assert.deepEqual(messages(sheet(person)), []);
  assert.match(messages(sheet(person.replace('minutes: 90', 'minutes: 91')))[0], /90 at most/);
  assert.match(messages(sheet(CHARTER.replace('minutes: 30', 'minutes: 2.5')))[0], /whole number/);
});

test('a sheet without front matter, or with broken YAML, says so', () => {
  assert.match(messages('# No charter\n\n## Findings\n\nNone.\n')[0], /starts with its charter/);
  assert.match(messages(sheet('---\nmission: [unclosed\n---\n'))[0], /not valid YAML/);
});

test('a finding without evidence is reported at its heading', () => {
  const text = sheet(CHARTER).replace(/^- Evidence: .*\n/m, '');
  const { problems } = parseSheet(text, FILE);
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /lacks Evidence; without evidence it is a question/);
  assert.equal(text.split('\n')[problems[0].line - 1].startsWith('### F1.'), true);
});

test('the evidence is a file of this session', () => {
  const text = sheet(CHARTER).replace(
    'explore/2026-11-26-cart-badge/',
    'explore/2026-11-20-other/',
  );
  assert.match(messages(text)[0], /under reports\/explore\/2026-11-26-cart-badge\//);
});

test('findings are read only under ## Findings, and bold item names are accepted', () => {
  const body = `\n## Findings\n\nNone.\n\n## Questions\n\n### Q1. Does the badge poll?\n- Seen: unsure\n`;
  assert.deepEqual(messages(sheet(CHARTER, body)), []);
  const bold = FINDING.replace('- Steps:', '- **Steps:**').replace('- Seen:', '- **Seen**:');
  const [finding] = findingsOf(`## Findings\n\n${bold}`);
  assert.equal(finding.items.get('Steps').value.startsWith('open'), true);
  assert.equal(finding.items.get('Seen').value.startsWith('the badge'), true);
});

test('a sheet needs a Findings section, and a writing session a Data created one', () => {
  assert.match(messages(sheet(CHARTER, '\n# Empty\n'))[0], /## Findings/);
  const writing = CHARTER.replace('writes: none', 'writes: allowed');
  assert.match(messages(sheet(writing))[0], /## Data created/);
  assert.deepEqual(
    messages(sheet(writing, `\n## Findings\n\nNone.\n\n## Data created\n\nNone.\n`)),
    [],
  );
});

test('stamping adds or replaces keys in the front matter and keeps the body', () => {
  const opened = stampSheet(sheet(CHARTER), { opened: '2026-11-26T10:00:00.000Z' });
  assert.match(opened, /\nminutes: 30\nopened: 2026-11-26T10:00:00.000Z\n---\n/);
  assert.equal(opened.endsWith(FINDING), true);
  const closed = stampSheet(opened, { opened: 'again', closed: 'later', ended: 'time box' });
  assert.match(closed, /\nopened: again\nclosed: later\nended: time box\n---\n/);
  assert.deepEqual(parseSheet(closed, FILE).problems, []);
  const crlf = stampSheet(sheet(CHARTER).replace(/\n/g, '\r\n'), { closed: 'x' });
  assert.match(crlf, /\r\nclosed: x\r\n---\r\n/);
  assert.throws(() => stampSheet('# none', { a: 'b' }), /no front matter/);
});
