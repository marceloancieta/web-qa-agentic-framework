// Redaction for anything that becomes evidence: attachments, HAR files, logged values. Keys are
// matched by name at any depth, case-insensitively, and treated one of two ways:
//   secret   - credentials and session material; the value is replaced by a fixed mask.
//   identity - values that are not secret but identify a person (email, postal address, user
//              id); the value becomes a stable pseudonym, so it still correlates across one run
//              without being readable.
// Secret key names have a built-in baseline; each pack adds its own in app.json (`secret_keys`,
// `identity_fields`). Free text cannot be read by key, so it is scrubbed of the secret values the
// run knows about (the actors' passwords, tokens returned by a login).

import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export const MASK = '***';
export const SALT_VARIABLE = 'QA_ANON_SALT';

const SECRET_KEY = /pass(word)?|secret|token|authorization|cookie|session|credential|api[-_]?key/i;

export interface RedactionPolicy {
  /** Extra secret key names, such as a custom session header. */
  secretKeys?: readonly string[];
  /** Keys whose values identify a person; pseudonymized rather than masked. */
  identityFields?: readonly string[];
  /** Secret values known to this run, removed from free text wherever they appear. */
  knownSecrets?: readonly string[];
}

// One salt per run, shared by the workers through the environment and never printed, so the
// pseudonym of a short value (a postcode) cannot be reversed by trying every candidate.
let fallbackSalt: string | undefined;
function salt(): string {
  const fromEnv = process.env[SALT_VARIABLE];
  if (fromEnv) return fromEnv;
  fallbackSalt ??= randomBytes(16).toString('hex');
  return fallbackSalt;
}

/** A stable, non-reversible stand-in for `value` within one run. */
export function pseudonym(value: unknown): string {
  const digest = createHmac('sha256', salt()).update(String(value)).digest('hex');
  return `anon:${digest.slice(0, 12)}`;
}

type Treatment = 'secret' | 'identity' | 'keep';

function classifier(policy: RedactionPolicy): (key: string) => Treatment {
  const secrets = new Set((policy.secretKeys ?? []).map((key) => key.toLowerCase()));
  const identities = new Set((policy.identityFields ?? []).map((key) => key.toLowerCase()));
  return (key) => {
    const name = key.toLowerCase();
    if (SECRET_KEY.test(key) || secrets.has(name)) return 'secret';
    if (identities.has(name)) return 'identity';
    return 'keep';
  };
}

/** `text` with every known secret value replaced by the mask. Values shorter than 4 are ignored. */
export function redactText(text: string, policy: RedactionPolicy = {}): string {
  const secrets = [...new Set(policy.knownSecrets ?? [])]
    .filter((secret) => secret.length >= 4)
    .sort((a, b) => b.length - a.length);
  return secrets.reduce((current, secret) => current.split(secret).join(MASK), text);
}

/** A deep copy of `value`: secrets masked, identity values pseudonymized, known secrets scrubbed. */
export function redact(value: unknown, policy: RedactionPolicy = {}): unknown {
  const classify = classifier(policy);
  const walk = (node: unknown, treatment: Treatment): unknown => {
    if (treatment === 'secret') return MASK;
    if (Array.isArray(node)) return node.map((item) => walk(item, treatment));
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node).map(([key, child]) => {
          const own = classify(key);
          return [key, walk(child, own === 'keep' ? treatment : own)];
        }),
      );
    }
    if (treatment === 'identity' && node !== null) return pseudonym(node);
    return typeof node === 'string' ? redactText(node, policy) : node;
  };
  return walk(value, 'keep');
}

/** `url` with sensitive query values treated the same way. Unparseable input comes back as is. */
export function redactUrl(url: string, policy: RedactionPolicy = {}): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return redactText(url, policy);
  }
  const classify = classifier(policy);
  for (const key of [...parsed.searchParams.keys()]) {
    const treatment = classify(key);
    if (treatment === 'secret') parsed.searchParams.set(key, MASK);
    if (treatment === 'identity') {
      parsed.searchParams.set(key, pseudonym(parsed.searchParams.get(key)));
    }
  }
  return redactText(parsed.toString(), policy);
}

interface HarHeader {
  name: string;
  value: string;
}
interface HarBody {
  text?: string;
}
interface HarEntry {
  request: { url: string; headers: HarHeader[]; cookies?: unknown[]; postData?: HarBody };
  response: { headers: HarHeader[]; cookies?: unknown[]; content?: HarBody };
}

function redactHeaders(headers: HarHeader[], policy: RedactionPolicy): HarHeader[] {
  const classify = classifier(policy);
  return headers.map((header) =>
    classify(header.name) === 'secret'
      ? { ...header, value: MASK }
      : { ...header, value: redactText(header.value, policy) },
  );
}

/** A body's text: JSON is redacted by key, anything else is scrubbed of known secrets. */
function redactBody(body: HarBody | undefined, policy: RedactionPolicy): HarBody | undefined {
  if (!body?.text) return body;
  try {
    return { ...body, text: JSON.stringify(redact(JSON.parse(body.text), policy)) };
  } catch {
    return { ...body, text: redactText(body.text, policy) };
  }
}

/**
 * A HAR archive with headers, cookies, query values and bodies redacted, so a recording can be
 * kept as a mock source without carrying a session.
 */
export function redactHar<T extends { log: { entries: HarEntry[] } }>(
  har: T,
  policy: RedactionPolicy = {},
): T {
  const entries = har.log.entries.map((entry) => ({
    ...entry,
    request: {
      ...entry.request,
      url: redactUrl(entry.request.url, policy),
      headers: redactHeaders(entry.request.headers, policy),
      cookies: [],
      postData: redactBody(entry.request.postData, policy),
    },
    response: {
      ...entry.response,
      headers: redactHeaders(entry.response.headers, policy),
      cookies: [],
      content: redactBody(entry.response.content, policy),
    },
  }));
  return { ...har, log: { ...har.log, entries } };
}

/** Redact a HAR file in place. */
export function redactHarFile(path: string, policy: RedactionPolicy = {}): void {
  const har = JSON.parse(readFileSync(path, 'utf8')) as { log: { entries: HarEntry[] } };
  writeFileSync(path, JSON.stringify(redactHar(har, policy), null, 2));
}
