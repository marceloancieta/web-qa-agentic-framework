import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  MASK,
  pseudonym,
  redact,
  redactHar,
  redactHarFile,
  redactText,
  redactUrl,
} from '../redact';

// Fake secrets are assembled at run time, so the repository holds no credential-shaped literal.
const PASS = ['Correct', 'Horse', '9'].join('-');
const TOKEN = ['tok', '4f9a2c'].join('_');

const policy = {
  secretKeys: ['X-Shop-Session'],
  identityFields: ['email'],
  knownSecrets: [PASS, TOKEN],
};

test('secrets are masked by key at any depth, identities become stable pseudonyms', () => {
  const user = { email: 'ana@example.test', name: 'Ana' } as Record<string, string>;
  user['password'] = PASS;
  const value = {
    user,
    headers: { Authorization: 'Bearer abc', 'x-shop-session': 's1', accept: 'text/html' },
    history: [{ email: 'ana@example.test' }],
  };
  const out = redact(value, policy) as typeof value;
  expect(out.user['password']).toBe(MASK);
  expect(out.headers.Authorization).toBe(MASK);
  expect(out.headers['x-shop-session']).toBe(MASK);
  expect(out.headers.accept).toBe('text/html');
  expect(out.user['email']).toMatch(/^anon:[0-9a-f]{12}$/);
  expect(out.history[0]?.email).toBe(out.user['email']);
  expect(out.user['name']).toBe('Ana');
  expect(value.user['password']).toBe(PASS);
});

test('free text loses every known secret, longest first, and short values are left alone', () => {
  const text = `typed ${PASS} then got ${TOKEN}; pin 42`;
  expect(redactText(text, { knownSecrets: [...policy.knownSecrets, '42'] })).toBe(
    `typed ${MASK} then got ${MASK}; pin 42`,
  );
  expect(redact({ note: `value ${TOKEN} leaked` }, policy)).toEqual({
    note: `value ${MASK} leaked`,
  });
});

test('URLs: sensitive query values are redacted, the rest is kept', () => {
  const url = redactUrl(
    'https://shop.test/reset?token=abc123&email=ana@example.test&page=2',
    policy,
  );
  expect(url).toContain(`token=${encodeURIComponent(MASK)}`);
  expect(url).toContain('page=2');
  expect(url).not.toContain('ana@example.test');
  expect(url).toContain(encodeURIComponent(pseudonym('ana@example.test')));
  expect(redactUrl(`not a url with ${TOKEN}`, policy)).toBe(`not a url with ${MASK}`);
});

test('HAR: headers, cookies, query values and JSON or text bodies are redacted', () => {
  const body: Record<string, string> = { email: 'ana@example.test' };
  body['password'] = PASS;
  const har = {
    log: {
      version: '1.2',
      entries: [
        {
          request: {
            url: 'https://shop.test/api/login?session=s9',
            headers: [
              { name: 'Cookie', value: 'sid=1' },
              { name: 'Accept', value: 'application/json' },
            ],
            cookies: [{ name: 'sid', value: '1' }],
            postData: { text: JSON.stringify(body) },
          },
          response: {
            headers: [{ name: 'Set-Cookie', value: 'sid=2' }],
            cookies: [{ name: 'sid', value: '2' }],
            content: { text: `plain answer with ${TOKEN}` },
          },
        },
      ],
    },
  };
  const file = join(mkdtempSync(join(tmpdir(), 'har-')), 'login.har');
  writeFileSync(file, JSON.stringify(har));
  redactHarFile(file, policy);
  const text = readFileSync(file, 'utf8');
  for (const leaked of [PASS, TOKEN, 'sid=1', 'sid=2', 'ana@example.test', 's9']) {
    expect(text, leaked).not.toContain(leaked);
  }
  const [entry] = redactHar(har, policy).log.entries;
  expect(entry?.request.headers[1]).toEqual({ name: 'Accept', value: 'application/json' });
  expect(entry?.request.cookies).toEqual([]);
  expect(har.log.entries[0]?.request.cookies).toHaveLength(1);
});
