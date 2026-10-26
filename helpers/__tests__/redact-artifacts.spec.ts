import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import AdmZip from 'adm-zip';
import config from '../../playwright.config';
import { MASK } from '../redact';
import { redactArtifacts } from '../redact-artifacts';
import {
  forgetRunSecrets,
  rememberSecret,
  RUN_SECRETS_ROOT,
  runnerRunDir,
  runSecrets,
  workerRunDir,
} from '../run-secrets';

// Built while the test runs, as a real run's secrets are.
const SECRET = ['Qa', 'artifact', String(4000 + 21), 'secret'].join('-');
const TOKEN = ['eyJ', 'fake', 'token', String(77)].join('.');

function zipOf(entries: Record<string, Buffer | string>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(content));
  }
  return zip.toBuffer();
}

function entryText(zip: Buffer, name: string): string {
  const entry = new AdmZip(zip).getEntries().find((e) => e.entryName === name);
  return entry?.getData().toString('utf8') ?? '';
}

test('every known secret is masked in text files, archives and an embedded report; nothing else changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-redact-'));
  mkdirSync(join(root, 'case'), { recursive: true });
  const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]);
  const trace = zipOf({
    'test.trace': `{"title":"Fill \\"${SECRET}\\""}\n{"value":"${TOKEN}"}`,
    'resources/5f2a9c': `password=${encodeURIComponent(SECRET)}&remember=on`,
    'resources/shot.png': binary,
  });
  const report = zipOf({ 'report.json': `{"steps":["Fill \\"${SECRET}\\""]}` });
  const files: Record<string, Buffer | string> = {
    'case/error-context.md': `- textbox "Password": ${SECRET}`,
    'case/trace.zip': trace,
    'case/clean.md': 'nothing secret here',
    'case/shot.png': binary,
    'result.json': JSON.stringify({ steps: [{ name: `Fill "${SECRET}"` }] }),
    'index.html': `<script>window.data = "data:application/zip;base64,${report.toString('base64')}";</script>`,
  };
  for (const [name, content] of Object.entries(files)) writeFileSync(join(root, name), content);

  const { redacted } = redactArtifacts([root, join(root, 'missing')], [SECRET, TOKEN, 'abc']);

  const read = (name: string) => readFileSync(join(root, name));
  expect(read('case/error-context.md').toString()).toBe(`- textbox "Password": ${MASK}`);
  expect(read('result.json').toString()).not.toContain(SECRET);
  const newTrace = read('case/trace.zip');
  expect(entryText(newTrace, 'test.trace')).not.toContain(SECRET);
  expect(entryText(newTrace, 'test.trace')).not.toContain(TOKEN);
  expect(entryText(newTrace, 'resources/5f2a9c')).toBe(`password=${MASK}&remember=on`);
  expect(
    new AdmZip(newTrace)
      .getEntries()
      .find((e) => e.entryName === 'resources/shot.png')
      ?.getData(),
  ).toEqual(binary);
  const embedded = /base64,([A-Za-z0-9+/=]+)/.exec(read('index.html').toString())?.[1] ?? '';
  expect(entryText(Buffer.from(embedded, 'base64'), 'report.json')).not.toContain(SECRET);
  expect(read('case/clean.md').toString()).toBe('nothing secret here');
  expect(read('case/shot.png')).toEqual(binary);
  expect(redacted.some((where) => where.endsWith('clean.md'))).toBe(false);
  // A value too short to be a secret ("abc") masks nothing.
  expect(read('case/clean.md').toString()).not.toContain(MASK);
});

test('the run remembers each secret once, and forgets them all', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'qa-run-secrets-')), 'run-secrets');
  rememberSecret(SECRET, dir);
  rememberSecret(SECRET, dir);
  rememberSecret(TOKEN, dir);
  rememberSecret('short', dir);
  expect(runSecrets(dir).sort()).toEqual([SECRET, TOKEN].sort());
  forgetRunSecrets(dir);
  expect(runSecrets(dir)).toEqual([]);
});

test('runs that overlap keep their own secrets: one run forgetting leaves the other alone', () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-run-secrets-'));
  const [first, second] = [join(root, '1001'), join(root, '1002')];
  rememberSecret(SECRET, first);
  rememberSecret(TOKEN, second);
  forgetRunSecrets(first);
  expect(runSecrets(first)).toEqual([]);
  expect(runSecrets(second)).toEqual([TOKEN]);
  // A worker files under its test runner, the parent process the reporter runs in.
  expect(workerRunDir()).toBe(join(RUN_SECRETS_ROOT, String(process.ppid)));
  expect(runnerRunDir()).toBe(join(RUN_SECRETS_ROOT, String(process.pid)));
});

test('the redaction reporter runs last, after every reporter that writes an artifact', () => {
  const reporters = Array.isArray(config.reporter) ? config.reporter : [];
  expect(reporters.at(-1)?.[0]).toBe('./helpers/redact-reporter.ts');
});
