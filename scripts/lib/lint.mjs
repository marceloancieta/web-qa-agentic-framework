// The parts every linter shares: one finding shape, one report format, and a self-test that must
// match exactly.
//
// Self-test: the linter runs over its fixture tree, where each line it must report carries a marker
// with the rule name, written in the comment syntax of the file:
//     await page.locator('#cart').click(); // expect-finding: spec-builds-locator
//     | login rejects a wrong password |  <!-- expect-finding: missing-dimension -->
// It passes only when the reported (file, line, rule) triples are exactly the marked ones, so a
// defect the linter misses and a false alarm on correct look-alike code fail it the same way.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const MARKER = /expect-finding:\s*([a-z][a-z0-9-]*(?:\s*,\s*[a-z][a-z0-9-]*)*)/;

/** @returns {{ rule: string, file: string, line: number, message: string }} */
export function finding(rule, file, line, message) {
  return { rule, file: file.replace(/\\/g, '/'), line, message };
}

const order = (a, b) =>
  a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule);

/** Print findings one per line (`file:line  rule  message`) and return the exit code. */
export function report(tool, findings, out = console) {
  const sorted = [...findings].sort(order);
  for (const f of sorted) out.log(`${f.file}:${f.line}  ${f.rule}  ${f.message}`);
  out.log(`${tool}: ${sorted.length === 0 ? 'clean' : `${sorted.length} finding(s)`}.`);
  return sorted.length === 0 ? 0 : 1;
}

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

/** The (file, line, rule) triples the fixtures under `dir` declare, paths relative to `dir`. */
export function expectedFindings(dir) {
  const expected = [];
  for (const path of filesUnder(dir)) {
    const file = relative(dir, path).replace(/\\/g, '/');
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .forEach((text, index) => {
        const match = MARKER.exec(text);
        if (!match) return;
        for (const rule of match[1].split(','))
          expected.push({ file, line: index + 1, rule: rule.trim() });
      });
  }
  return expected;
}

const triple = (f) => `${f.file}:${f.line}:${f.rule}`;

/**
 * Compare actual findings (paths relative to the fixture dir) with the markers.
 * @returns {{ missed: string[], unexpected: string[] }} both empty when the linter is exact.
 */
export function compareWithMarkers(dir, actual) {
  const want = new Set(expectedFindings(dir).map(triple));
  const got = new Set(actual.map(triple));
  return {
    missed: [...want].filter((t) => !got.has(t)).sort(),
    unexpected: [...got].filter((t) => !want.has(t)).sort(),
  };
}

/** Run a self-test and print the outcome; returns the exit code. */
export function selfTest(tool, dir, actual, out = console) {
  const { missed, unexpected } = compareWithMarkers(dir, actual);
  for (const t of missed) out.log(`missed      ${t}`);
  for (const t of unexpected) out.log(`unexpected  ${t}`);
  const exact = missed.length === 0 && unexpected.length === 0;
  out.log(`${tool} self-test: ${exact ? `exact (${actual.length} findings)` : 'FAILED'}.`);
  return exact ? 0 : 1;
}
