// Security headers per response, against a per-pack baseline of known gaps
// (`apps/<pack>/headers-known.json`). The core fixtures record, for every page they open, the
// responses of the pack's own origin: documents for the header rules, documents and XHR or fetch
// answers for the cookies they set. A third-party response is never judged.
//
// Header rules, on every document that is not a redirect:
//   content-security-policy    a Content-Security-Policy header; Report-Only alone enforces nothing
//   frame-ancestors            X-Frame-Options DENY or SAMEORIGIN, or a CSP frame-ancestors directive
//   strict-transport-security  on https only: Strict-Transport-Security with a max-age above 0
//   x-content-type-options     X-Content-Type-Options: nosniff
//   referrer-policy            a Referrer-Policy that keeps the path from other origins
//   permissions-policy         a Permissions-Policy header; Feature-Policy is its retired name
// Cookie rules, on every Set-Cookie the browser saw (a cookie written by a script is not seen):
//   cookie-secure              on https only: the Secure attribute
//   cookie-httponly            the HttpOnly attribute
//   cookie-samesite            a SameSite attribute
//
// A gap is identified by its rule, the route of the response (path and query; the hash never
// reaches the server) and, for a cookie rule, the cookie's name. A baseline entry names those, a
// tracker key and an expiry; route `*` covers every route. Each gap is:
//   new      not in the baseline, or in it with an expiry that has passed: the check fails
//   known    in the baseline and not expired: reported, does not fail
// and an entry whose subject was seen and passed is reported as gone, so it can leave the baseline.
// An entry only ever excuses its own rule, so a known missing CSP never hides a header that goes
// missing later.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { sweepPlan } from './a11y-sweep';
import { ANONYMOUS_ACTOR, REPO_ROOT } from './config';

export const HEADER_RULES = [
  'content-security-policy',
  'frame-ancestors',
  'strict-transport-security',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
] as const;

export const COOKIE_RULES = ['cookie-secure', 'cookie-httponly', 'cookie-samesite'] as const;

export type HeaderRule = (typeof HEADER_RULES)[number];
export type CookieRule = (typeof COOKIE_RULES)[number];
export type SecurityRule = HeaderRule | CookieRule;

/** A response of the pack's origin, as the browser received it. */
export interface ObservedResponse {
  url: string;
  status: number;
  /** `document` for a page or frame, `request` for an XHR or fetch answer. */
  kind: 'document' | 'request';
  headers: readonly { name: string; value: string }[];
}

/** What a rule was checked on: a route, and the cookie for a cookie rule. */
export interface Subject {
  rule: SecurityRule;
  route: string;
  cookie?: string;
}

export interface HeaderGap extends Subject {
  url: string;
  detail: string;
}

export interface KnownHeaderGap {
  rule: SecurityRule;
  /** The route of the response, a path such as `/` or `/cart.html`, or `*` for every route. */
  route: string;
  /** The cookie's name, for a cookie rule only. */
  cookie?: string;
  /** The tracker issue that follows it. */
  key: string;
  /** The day the entry stops excusing the gap, `YYYY-MM-DD`. */
  expires: string;
}

export interface Evaluation {
  gaps: HeaderGap[];
  passed: Subject[];
}

export interface HeaderComparison {
  new: (HeaderGap & { expired?: KnownHeaderGap })[];
  known: (HeaderGap & { entry: KnownHeaderGap })[];
  gone: KnownHeaderGap[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RULES: readonly string[] = [...HEADER_RULES, ...COOKIE_RULES];
const isCookieRule = (rule: string) => (COOKIE_RULES as readonly string[]).includes(rule);

/** The referrer policies that send no path to another origin. */
const SAFE_REFERRER = new Set([
  'no-referrer',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
]);

/** The baseline of a pack, checked entry by entry. A missing file is an empty baseline. */
export function loadHeaderBaseline(file: string): KnownHeaderGap[] {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const entries = JSON.parse(text) as Partial<KnownHeaderGap>[];
  const problems = entries.flatMap((entry, index) => {
    const at = `entry ${index}`;
    const missing = (['rule', 'route', 'key', 'expires'] as const)
      .filter((field) => typeof entry[field] !== 'string' || !entry[field])
      .map((field) => `${at} has no ${field}`);
    const rule = entry.rule ?? '';
    return [
      ...missing,
      ...(rule && !RULES.includes(rule) ? [`${at} has an unknown rule "${rule}"`] : []),
      ...(rule && isCookieRule(rule) && !entry.cookie
        ? [`${at} is a cookie rule without cookie`]
        : []),
      ...(rule && !isCookieRule(rule) && entry.cookie !== undefined
        ? [`${at} names a cookie on a header rule`]
        : []),
      ...(entry.expires && !DATE.test(entry.expires) ? [`${at} expires is not YYYY-MM-DD`] : []),
    ];
  });
  if (problems.length > 0) throw new Error(`${file}: ${problems.join('; ')}.`);
  return entries as KnownHeaderGap[];
}

/** The route of a response as the baseline records it: path and query, never the hash. */
export function documentRoute(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

/** The values of a header, by name in any case; a repeated header gives one value per line. */
function valuesOf(response: ObservedResponse, name: string): string[] {
  return response.headers
    .filter((header) => header.name.toLowerCase() === name)
    .flatMap((header) => header.value.split('\n'))
    .map((value) => value.trim())
    .filter(Boolean);
}

/** The header rules on one document: the gaps and the rules it passed. */
function headerChecks(response: ObservedResponse): [HeaderRule, string | null][] {
  const https = new URL(response.url).protocol === 'https:';
  const csp = valuesOf(response, 'content-security-policy');
  const reportOnly = valuesOf(response, 'content-security-policy-report-only');
  const frameOptions = valuesOf(response, 'x-frame-options').map((v) => v.toLowerCase());
  const hsts = valuesOf(response, 'strict-transport-security');
  const nosniff = valuesOf(response, 'x-content-type-options').map((v) => v.toLowerCase());
  // A list of policies is allowed; the browser applies the last one it knows.
  const referrer = valuesOf(response, 'referrer-policy')
    .flatMap((value) => value.split(','))
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .at(-1);
  const permissions = valuesOf(response, 'permissions-policy');
  const featurePolicy = valuesOf(response, 'feature-policy');

  const checks: [HeaderRule, string | null][] = [
    [
      'content-security-policy',
      csp.length > 0
        ? null
        : reportOnly.length > 0
          ? 'only Content-Security-Policy-Report-Only, which reports and blocks nothing'
          : 'no Content-Security-Policy header',
    ],
    [
      'frame-ancestors',
      frameOptions.some((v) => v === 'deny' || v === 'sameorigin') ||
      csp.some((policy) => /(?:^|;)\s*frame-ancestors\s/i.test(policy))
        ? null
        : frameOptions.length > 0
          ? `X-Frame-Options "${frameOptions.join(', ')}" is neither DENY nor SAMEORIGIN, and no CSP frame-ancestors`
          : 'neither X-Frame-Options nor a CSP frame-ancestors directive: any site can frame the page',
    ],
    [
      'x-content-type-options',
      nosniff.includes('nosniff')
        ? null
        : nosniff.length > 0
          ? `X-Content-Type-Options is "${nosniff.join(', ')}", not nosniff`
          : 'no X-Content-Type-Options: nosniff',
    ],
    [
      'referrer-policy',
      referrer && SAFE_REFERRER.has(referrer)
        ? null
        : referrer
          ? `Referrer-Policy "${referrer}" sends the path to other origins`
          : 'no Referrer-Policy header',
    ],
    [
      'permissions-policy',
      permissions.length > 0
        ? null
        : featurePolicy.length > 0
          ? 'no Permissions-Policy header, only Feature-Policy, its retired name'
          : 'no Permissions-Policy header',
    ],
  ];
  if (https) {
    const maxAge = Number(/max-age\s*=\s*"?(\d+)/i.exec(hsts.join(';'))?.[1] ?? 0);
    checks.push([
      'strict-transport-security',
      maxAge > 0
        ? null
        : hsts.length > 0
          ? 'Strict-Transport-Security with max-age 0 turns it off'
          : 'no Strict-Transport-Security header on an https page',
    ]);
  }
  return checks;
}

/** The cookie rules on one Set-Cookie line, `[rule, gap or null]`, and the cookie's name. */
export function cookieChecks(
  line: string,
  https: boolean,
): { cookie: string; checks: [CookieRule, string | null][] } {
  const [pair = '', ...attributes] = line.split(';').map((part) => part.trim());
  const cookie = pair.split('=')[0]?.trim() || '(unnamed)';
  const names = new Set(attributes.map((a) => a.split('=')[0]?.trim().toLowerCase()));
  const checks: [CookieRule, string | null][] = [
    [
      'cookie-httponly',
      names.has('httponly') ? null : `cookie ${cookie} has no HttpOnly: page scripts can read it`,
    ],
    [
      'cookie-samesite',
      names.has('samesite') ? null : `cookie ${cookie} has no SameSite attribute`,
    ],
  ];
  if (https) {
    checks.unshift([
      'cookie-secure',
      names.has('secure') ? null : `cookie ${cookie} has no Secure: it can travel over http`,
    ]);
  }
  return { cookie, checks };
}

/** Check every recorded response: the gaps found, each once, and the subjects that passed. */
export function evaluate(responses: readonly ObservedResponse[]): Evaluation {
  const gaps = new Map<string, HeaderGap>();
  const passed = new Map<string, Subject>();
  const record = (subject: Subject, url: string, detail: string | null) => {
    const id = `${subject.rule} ${subject.route} ${subject.cookie ?? ''}`;
    if (detail === null) passed.set(id, subject);
    else if (!gaps.has(id)) gaps.set(id, { ...subject, url, detail });
  };
  for (const response of responses) {
    const route = documentRoute(response.url);
    // A redirect's own headers are not the page's; the page it leads to is recorded too.
    if (response.kind === 'document' && (response.status < 300 || response.status >= 400)) {
      for (const [rule, detail] of headerChecks(response))
        record({ rule, route }, response.url, detail);
    }
    const https = new URL(response.url).protocol === 'https:';
    for (const line of valuesOf(response, 'set-cookie')) {
      const { cookie, checks } = cookieChecks(line, https);
      for (const [rule, detail] of checks) record({ rule, route, cookie }, response.url, detail);
    }
  }
  // A subject that failed once failed, even if another response for it passed.
  for (const id of gaps.keys()) passed.delete(id);
  return { gaps: [...gaps.values()], passed: [...passed.values()] };
}

const covers = (entry: KnownHeaderGap, subject: Subject) =>
  entry.rule === subject.rule &&
  (entry.route === '*' || entry.route === subject.route) &&
  (entry.cookie ?? null) === (subject.cookie ?? null);

/** Split the gaps into new and known, and list the entries whose subject now passes. */
export function compareWithKnownGaps(
  { gaps, passed }: Evaluation,
  baseline: readonly KnownHeaderGap[],
  today = new Date().toISOString().slice(0, 10),
): HeaderComparison {
  const result: HeaderComparison = { new: [], known: [], gone: [] };
  const used = new Set<KnownHeaderGap>();
  for (const gap of gaps) {
    const entries = baseline.filter((entry) => covers(entry, gap));
    entries.forEach((entry) => used.add(entry));
    const entry = entries.find((e) => e.expires >= today);
    if (entry) result.known.push({ ...gap, entry });
    else if (entries[0]) result.new.push({ ...gap, expired: entries[0] });
    else result.new.push(gap);
  }
  result.gone = baseline.filter(
    (entry) => !used.has(entry) && passed.some((subject) => covers(entry, subject)),
  );
  return result;
}

/** The failure message for new gaps, or null when there are none. */
export function headerReport(comparison: HeaderComparison, baselineFile: string): string | null {
  if (comparison.new.length === 0) return null;
  const lines = comparison.new.map((gap) => {
    const expired = gap.expired
      ? ` (baseline entry ${gap.expired.key} expired ${gap.expired.expires})`
      : '';
    return `  ${gap.rule} on ${gap.route}: ${gap.detail}${expired}`;
  });
  return (
    `${comparison.new.length} new security header gap(s):\n${lines.join('\n')}\n` +
    `Fix them, or file each one and add it to ${baselineFile} with its tracker key and an expiry.`
  );
}

interface Recorder {
  origin: string;
  pending: Promise<ObservedResponse | null>[];
}

const recorders = new WeakMap<Page, Recorder>();
const RECORDED_TYPES = new Set(['document', 'xhr', 'fetch']);

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Record the responses of `baseUrl`'s origin that this page receives: documents, and XHR or fetch
 * answers for the cookies they set. Call before the first navigation; the core fixtures do, for
 * every page they open.
 */
export function recordResponses(page: Page, baseUrl: string): void {
  const recorder: Recorder = { origin: new URL(baseUrl).origin, pending: [] };
  recorders.set(page, recorder);
  page.on('response', (response) => {
    const type = response.request().resourceType();
    if (!RECORDED_TYPES.has(type) || originOf(response.url()) !== recorder.origin) return;
    recorder.pending.push(
      // Every header, Set-Cookie included, which `headers()` leaves out.
      response
        .headersArray()
        .then((headers) => ({
          url: response.url(),
          status: response.status(),
          kind: type === 'document' ? ('document' as const) : ('request' as const),
          headers,
        }))
        .catch(() => null),
    );
  });
}

/** The responses recorded for a page so far, or null when nothing records it. */
export async function recordedResponses(page: Page): Promise<ObservedResponse[] | null> {
  const recorder = recorders.get(page);
  if (!recorder) return null;
  const responses = await Promise.all(recorder.pending);
  return responses.filter((response): response is ObservedResponse => response !== null);
}

/** A route to check as a role: the app maps' routes, one per document a role opens. */
export interface HeaderTarget {
  role: string;
  /** The route to open, as the app map recorded it. */
  route: string;
  /** The document it loads, path and query: what the baseline keys a gap by. */
  document: string;
}

/**
 * The routes to check for a pack: the routes of its app maps per role, as the a11y sweep plans
 * them, one per document, since routes that differ only in their hash load the same document. A
 * pack without an anonymous map yet (a new one) checks its root, anonymous; a map that exists and
 * cannot be read is a problem, which the spec turns into a failing test.
 */
export function headerTargets(pack: string, root = REPO_ROOT) {
  const plan = sweepPlan(pack, root);
  const unmapped = !existsSync(join(root, 'apps', pack, 'docs', 'app-map.json'));
  const routes = unmapped ? [{ role: ANONYMOUS_ACTOR, route: '/' }, ...plan.targets] : plan.targets;
  const problems = unmapped ? plan.problems.slice(1) : plan.problems;
  const seen = new Set<string>();
  const targets: HeaderTarget[] = [];
  for (const { role, route } of routes) {
    const document = documentRoute(new URL(route, 'http://route.invalid').href);
    if (seen.has(`${role} ${document}`)) continue;
    seen.add(`${role} ${document}`);
    targets.push({ role, route, document });
  }
  return { targets, problems };
}
