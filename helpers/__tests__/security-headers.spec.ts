import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  compareWithKnownGaps,
  cookieChecks,
  documentRoute,
  evaluate,
  headerReport,
  headerTargets,
  loadHeaderBaseline,
  recordedResponses,
  recordResponses,
  type KnownHeaderGap,
  type ObservedResponse,
} from '../security-headers';
import { expect, SECURITY_HEADERS, test, THIRD_PARTY_HOST } from './fake-app';

const response = (
  headers: Record<string, string>,
  url = 'http://shop.test/',
  extra: Partial<ObservedResponse> = {},
): ObservedResponse => ({
  url,
  status: 200,
  kind: 'document',
  headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
  ...extra,
});

const without = (name: string) =>
  Object.fromEntries(Object.entries(SECURITY_HEADERS).filter(([key]) => key !== name));

const rulesOf = (responses: ObservedResponse[]) =>
  evaluate(responses)
    .gaps.map((gap) => gap.rule)
    .sort();

test('a document with every header and a well-made cookie has no gap, on http and https', () => {
  expect(evaluate([response(SECURITY_HEADERS)]).gaps).toEqual([]);
  const https = { ...SECURITY_HEADERS, 'strict-transport-security': 'max-age=31536000' };
  const secure = { ...https, 'set-cookie': `${SECURITY_HEADERS['set-cookie']}; Secure` };
  const result = evaluate([response(secure, 'https://shop.test/')]);
  expect(result.gaps).toEqual([]);
  expect(result.passed.map((s) => s.rule)).toContain('strict-transport-security');
  expect(result.passed.map((s) => s.rule)).toContain('cookie-secure');
});

test('each missing header is its own gap, and none is reported twice', () => {
  for (const header of [
    'content-security-policy',
    'x-content-type-options',
    'referrer-policy',
    'permissions-policy',
  ]) {
    expect(rulesOf([response(without(header)), response(without(header))])).toEqual([header]);
  }
  // A page with no header at all, on https: every header rule, and nothing about cookies.
  expect(rulesOf([response({}, 'https://shop.test/')])).toEqual([
    'content-security-policy',
    'frame-ancestors',
    'permissions-policy',
    'referrer-policy',
    'strict-transport-security',
    'x-content-type-options',
  ]);
});

test('look-alikes of a header do not count as the header', () => {
  const gap = (headers: Record<string, string>, url?: string) =>
    evaluate([response(headers, url)]).gaps.map((g) => `${g.rule}: ${g.detail}`);
  const base = without('content-security-policy');
  expect(gap({ ...base, 'content-security-policy-report-only': "default-src 'self'" })).toEqual([
    'content-security-policy: only Content-Security-Policy-Report-Only, which reports and blocks nothing',
  ]);
  expect(gap({ ...without('permissions-policy'), 'feature-policy': "payment 'self'" })).toEqual([
    'permissions-policy: no Permissions-Policy header, only Feature-Policy, its retired name',
  ]);
  expect(gap({ ...SECURITY_HEADERS, 'x-content-type-options': 'sniff' })).toEqual([
    'x-content-type-options: X-Content-Type-Options is "sniff", not nosniff',
  ]);
  expect(gap({ ...SECURITY_HEADERS, 'referrer-policy': 'no-referrer, unsafe-url' })).toEqual([
    'referrer-policy: Referrer-Policy "unsafe-url" sends the path to other origins',
  ]);
  expect(
    gap(
      {
        ...SECURITY_HEADERS,
        'strict-transport-security': 'max-age=0',
        'set-cookie': 'a=1; Secure; HttpOnly; SameSite=Lax',
      },
      'https://shop.test/',
    ),
  ).toEqual(['strict-transport-security: Strict-Transport-Security with max-age 0 turns it off']);
  // Framing: either header protects; ALLOWALL and a CSP without the directive do not.
  const framing = {
    ...SECURITY_HEADERS,
    'content-security-policy': "default-src 'self'",
    'x-frame-options': 'ALLOWALL',
  };
  expect(gap(framing)[0]).toMatch(/^frame-ancestors: X-Frame-Options "allowall" is neither/);
  expect(gap({ ...framing, 'x-frame-options': 'SAMEORIGIN' })).toEqual([]);
  expect(
    gap({ ...without('x-frame-options'), 'content-security-policy': "frame-ancestors 'self'" }),
  ).toEqual([]);
  // A list of referrer policies: the last one the browser knows applies.
  expect(gap({ ...SECURITY_HEADERS, 'referrer-policy': 'unsafe-url, no-referrer' })).toEqual([]);
});

test('cookies: each missing attribute is a gap; Secure counts on https only', () => {
  const rules = (line: string, https: boolean) =>
    cookieChecks(line, https)
      .checks.filter(([, detail]) => detail !== null)
      .map(([rule]) => rule);
  expect(cookieChecks('token=abc; Path=/', false).cookie).toBe('token');
  expect(rules('token=abc; Path=/', false)).toEqual(['cookie-httponly', 'cookie-samesite']);
  expect(rules('token=abc; Path=/', true)).toEqual([
    'cookie-secure',
    'cookie-httponly',
    'cookie-samesite',
  ]);
  expect(rules('token=abc; Secure; HttpOnly; SameSite=Strict', true)).toEqual([]);
  // The attribute's name, not a value that contains it.
  expect(rules('note=httponly-secure-samesite', true)).toHaveLength(3);
  // A cookie set by an XHR answer is judged like one set by a document.
  const answer = response({ 'set-cookie': 'tracker=1' }, 'http://shop.test/api/x', {
    kind: 'request',
  });
  expect(evaluate([answer]).gaps.map((g) => `${g.rule} ${g.cookie} ${g.route}`)).toEqual([
    'cookie-httponly tracker /api/x',
    'cookie-samesite tracker /api/x',
  ]);
});

test('a redirect and an answer that is not a document are not judged by the header rules', () => {
  expect(evaluate([response({}, 'http://shop.test/old', { status: 302 })]).gaps).toEqual([]);
  expect(evaluate([response({}, 'http://shop.test/api', { kind: 'request' })]).gaps).toEqual([]);
  expect(evaluate([response({}, 'http://shop.test/missing', { status: 404 })]).gaps).toHaveLength(
    5,
  );
});

test('the route is the path and the query, never the hash', () => {
  expect(documentRoute('http://shop.test/#/login')).toBe('/');
  expect(documentRoute('http://shop.test/item.html?id=4#top')).toBe('/item.html?id=4');
});

const entry = (rule: KnownHeaderGap['rule'], extra: Partial<KnownHeaderGap> = {}) =>
  ({ rule, route: '*', key: 'LOCAL-7', expires: '2099-01-01', ...extra }) as KnownHeaderGap;

test('new, known, expired and gone gaps against the baseline', () => {
  const evaluation = evaluate([
    response(without('content-security-policy')),
    response(without('referrer-policy'), 'http://shop.test/about'),
    response({ ...SECURITY_HEADERS, 'set-cookie': 'token=1' }, 'http://shop.test/cart'),
  ]);
  const comparison = compareWithKnownGaps(
    evaluation,
    [
      entry('content-security-policy'),
      entry('referrer-policy', { route: '/about', expires: '2026-01-01' }),
      entry('cookie-httponly', { cookie: 'token' }),
      // Kept by every document of this check: gone.
      entry('x-content-type-options'),
      // Its route was not checked, and no session cookie broke a rule: neither one is gone.
      entry('permissions-policy', { route: '/admin' }),
      entry('cookie-samesite', { cookie: 'other' }),
    ],
    '2026-11-03',
  );
  expect(comparison.known.map((g) => `${g.rule} ${g.route}`)).toEqual([
    'content-security-policy /',
    'cookie-httponly /cart',
  ]);
  expect(comparison.new.map((g) => `${g.rule} ${g.route}`)).toEqual([
    'referrer-policy /about',
    'cookie-samesite /cart',
  ]);
  expect(comparison.new[0]?.expired?.expires).toBe('2026-01-01');
  expect(comparison.gone.map((g) => g.rule)).toEqual(['x-content-type-options']);
  const report = headerReport(comparison, 'apps/shop/headers-known.json');
  expect(report).toContain('2 new security header gap(s):');
  expect(report).toContain(
    'referrer-policy on /about: no Referrer-Policy header (baseline entry LOCAL-7 expired 2026-01-01)',
  );
  expect(report).toContain('cookie-samesite on /cart: cookie token has no SameSite attribute');
  expect(headerReport({ new: [], known: [], gone: [] }, 'x')).toBeNull();
});

test('a known gap excuses only its own rule: a header that goes missing later is new', () => {
  const known = [entry('content-security-policy')];
  const before = compareWithKnownGaps(
    evaluate([response(without('content-security-policy'))]),
    known,
  );
  expect(before.new).toEqual([]);
  const later = { ...without('content-security-policy'), 'x-content-type-options': '' };
  const after = compareWithKnownGaps(evaluate([response(later)]), known);
  expect(after.new.map((g) => g.rule)).toEqual(['x-content-type-options']);
  expect(after.known.map((g) => g.rule)).toEqual(['content-security-policy']);
});

test('a broken baseline is refused entry by entry; a missing one is empty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'headers-known-'));
  expect(loadHeaderBaseline(join(dir, 'none.json'))).toEqual([]);
  const file = join(dir, 'headers-known.json');
  writeFileSync(
    file,
    JSON.stringify([
      { rule: 'content-security-policy', route: '*', key: 'LOCAL-1', expires: '2027-01-01' },
      { rule: 'csp', route: '*', key: 'LOCAL-1', expires: '2027-01-01' },
      { rule: 'cookie-httponly', route: '*', key: 'LOCAL-1', expires: '2027-01-01' },
      { rule: 'referrer-policy', route: '*', cookie: 'a', key: 'LOCAL-1', expires: '2027-01-01' },
      { rule: 'permissions-policy', route: '*', expires: '01/01/2027' },
    ]),
  );
  expect(() => loadHeaderBaseline(file)).toThrow(
    'entry 1 has an unknown rule "csp"; entry 2 is a cookie rule without cookie; entry 3 names a cookie on a header rule; entry 4 has no key; entry 4 expires is not YYYY-MM-DD.',
  );
});

test("the recorder keeps the documents and fetch answers of the pack's origin only", async ({
  page,
  fakeApp,
}) => {
  expect(await recordedResponses(page)).toBeNull();
  recordResponses(page, fakeApp.url);
  // /products also loads a script from a third-party host, which is never recorded.
  await page.goto(`${fakeApp.url}/products`);
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await page.goto(`${fakeApp.url}/headers`);
  await page.evaluate(() => fetch('/api/cookie'));
  const recorded = (await recordedResponses(page)) ?? [];
  expect(recorded.map((r) => `${r.kind} ${new URL(r.url).pathname}`)).toEqual([
    'document /products',
    'request /api/products',
    'document /headers',
    'request /api/cookie',
  ]);
  expect(recorded.some((r) => r.url.includes(THIRD_PARTY_HOST))).toBe(false);
  // Set-Cookie is among the headers: Playwright's headers() would leave it out.
  const gaps = evaluate(recorded).gaps.map((g) => `${g.rule} ${g.route} ${g.cookie ?? ''}`.trim());
  expect(gaps).toEqual([
    'content-security-policy /products',
    'frame-ancestors /products',
    'x-content-type-options /products',
    'referrer-policy /products',
    'permissions-policy /products',
    'cookie-httponly /api/cookie tracker',
    'cookie-samesite /api/cookie tracker',
  ]);
});

test('the targets are the routes of the app maps, one per document and role', () => {
  const root = mkdtempSync(join(tmpdir(), 'headers-plan-'));
  const docs = join(root, 'apps', 'shop', 'docs');
  mkdirSync(docs, { recursive: true });
  const map = (routes: string[]) => JSON.stringify({ routes: routes.map((route) => ({ route })) });
  writeFileSync(join(docs, 'app-map.json'), map(['/#/', '/#/login', '/about?tab=1']));
  writeFileSync(join(docs, 'app-map.customer.json'), map(['/#/basket']));
  expect(headerTargets('shop', root)).toEqual({
    targets: [
      { role: 'anonymous', route: '/#/', document: '/' },
      { role: 'anonymous', route: '/about?tab=1', document: '/about?tab=1' },
      { role: 'customer', route: '/#/basket', document: '/' },
    ],
    problems: [],
  });
  // A new pack, before its first app map: its root, anonymous, so the skeleton's run stays green.
  expect(headerTargets('none', root)).toEqual({
    targets: [{ role: 'anonymous', route: '/', document: '/' }],
    problems: [],
  });
  // A map that exists and cannot be read is a problem, never a silent fallback.
  const broken = join(root, 'apps', 'broken', 'docs');
  mkdirSync(broken, { recursive: true });
  writeFileSync(join(broken, 'app-map.json'), '{ not json');
  const plan = headerTargets('broken', root);
  expect(plan.targets).toEqual([]);
  expect(plan.problems[0]).toMatch(/cannot read .*app-map\.json/);
});
