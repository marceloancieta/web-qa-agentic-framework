// Removing the run's secrets from what Playwright and the reporters write. Evidence the framework
// attaches is redacted as it is made (helpers/evidence.ts), but Playwright writes some on its own:
// the failure context prints the value of a password field, a trace keeps every typed text in its
// step titles and its DOM snapshots, and the HTML report and the Allure results copy both. This
// replaces each known secret with the mask in text files, inside zip archives (traces, and the
// report data the HTML report embeds as base64), and leaves every other byte as it was.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import AdmZip from 'adm-zip';
import { MASK } from './redact';

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.json',
  '.jsonl',
  '.html',
  '.xml',
  '.log',
  '.trace',
  '.network',
  '.har',
  '.yml',
]);
const EMBEDDED_ZIP = /data:application\/zip;base64,([A-Za-z0-9+/=]+)/g;

export interface RedactionReport {
  /** Files (and archive entries) that held at least one secret. */
  redacted: string[];
}

/** The forms a secret takes in text: as typed, and as a URL or form body encodes it. */
function forms(secrets: readonly string[]): string[] {
  const all = secrets.flatMap((secret) => [secret, encodeURIComponent(secret)]);
  return [...new Set(all)].filter((form) => form.length >= 6).sort((a, b) => b.length - a.length);
}

function scrub(text: string, secretForms: readonly string[]): string {
  return secretForms.reduce((current, form) => current.split(form).join(MASK), text);
}

/** A zip with its text entries scrubbed, or null when no entry held a secret. */
function scrubZip(
  data: Buffer,
  secretForms: readonly string[],
  where: string,
  report: RedactionReport,
) {
  const zip = new AdmZip(data);
  let changed = false;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const content = entry.getData();
    const result = scrubBuffer(
      content,
      entry.entryName,
      secretForms,
      `${where}!${entry.entryName}`,
      report,
    );
    if (result) {
      zip.updateFile(entry, result);
      changed = true;
    }
  }
  return changed ? zip.toBuffer() : null;
}

/** The content scrubbed, or null when it held no secret (or is not text or a zip). */
function scrubBuffer(
  content: Buffer,
  name: string,
  secretForms: readonly string[],
  where: string,
  report: RedactionReport,
): Buffer | null {
  const extension = extname(name).toLowerCase();
  if (extension === '.zip') return scrubZip(content, secretForms, where, report);
  // Trace resources are named by their hash with no extension: read them as text when they are.
  const isText = TEXT_EXTENSIONS.has(extension) || (extension === '' && !content.includes(0));
  if (!isText) return null;
  const text = content.toString('utf8');
  let scrubbed = scrub(text, secretForms);
  if (extension === '.html') {
    scrubbed = scrubbed.replace(EMBEDDED_ZIP, (whole, base64: string) => {
      const inner = scrubZip(
        Buffer.from(base64, 'base64'),
        secretForms,
        `${where}#embedded`,
        report,
      );
      return inner ? `data:application/zip;base64,${inner.toString('base64')}` : whole;
    });
  }
  if (scrubbed === text) return null;
  report.redacted.push(where);
  return Buffer.from(scrubbed, 'utf8');
}

function* filesUnder(path: string): Generator<string> {
  if (!existsSync(path)) return;
  if (statSync(path).isFile()) {
    yield path;
    return;
  }
  for (const name of readdirSync(path)) yield* filesUnder(join(path, name));
}

/** Replace every known secret in the files under `roots` (directories or files) with the mask. */
export function redactArtifacts(
  roots: readonly string[],
  secrets: readonly string[],
): RedactionReport {
  const report: RedactionReport = { redacted: [] };
  const secretForms = forms(secrets);
  if (secretForms.length === 0) return report;
  for (const root of new Set(roots)) {
    for (const file of filesUnder(root)) {
      const result = scrubBuffer(readFileSync(file), file, secretForms, file, report);
      if (result) writeFileSync(file, result);
    }
  }
  return report;
}
