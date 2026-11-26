// The sheet of a chartered exploratory session (ADR 0013): `apps/<pack>/docs/sessions/<date>-<slug>.md`.
// Its front matter is the charter, which `explore open` reads before it starts a browser; its body
// records what the session saw. This module owns the format; `lint-docs` (rule `session-sheet`) and
// `scripts/explore.mjs` both read it through `parseSheet`.
//
// Charter keys:
//   mission       what the session looks for, one sentence
//   pack          the pack the sheet's folder belongs to
//   environment   a qa-config environment; never one whose name starts with "prod"
//   routes        the routes the session starts from, each starting with "/"
//   role          an actor of the pack in that environment, or "anonymous"; one per session
//   device        a device project
//   driver        person | agent | both
//   writes        none | allowed
//   out_of_bounds what the session leaves alone (a list; empty when nothing is)
//   minutes       the time box: a person 60 by default and 90 at most, an agent (or both) 30 by
//                 default and 60 at most, since an agent's time costs tokens
// `explore open` adds `opened`, and `explore close` adds `closed` and `ended`.
//
// Body: a `## Findings` section, where each finding is a `### ` heading followed by the items
// Steps, Expected, Seen, Device, Role, Reproduced and Evidence; the evidence names a file under
// `reports/explore/<session>/`. Without evidence a finding is a question, and goes under
// `## Questions`. A writing session also lists what it created under `## Data created`.

import { parse as parseYaml } from 'yaml';

export const SESSIONS_DIR = /^apps\/([^/]+)\/docs\/sessions\/([^/]+)\.md$/;
const SHEET_NAME = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const NAME = /^[a-z][a-z0-9-]*$/;
export const DRIVERS = ['person', 'agent', 'both'];
export const WRITES = ['none', 'allowed'];
export const FINDING_ITEMS = [
  'Steps',
  'Expected',
  'Seen',
  'Device',
  'Role',
  'Reproduced',
  'Evidence',
];
const REQUIRED_KEYS = [
  'mission',
  'pack',
  'environment',
  'routes',
  'role',
  'device',
  'driver',
  'writes',
  'out_of_bounds',
  'minutes',
];

/** The time box of a driver: `{ preset, most }` in minutes. */
export function timeBox(driver) {
  return driver === 'person' ? { preset: 60, most: 90 } : { preset: 30, most: 60 };
}

/** The session id of a sheet path (its file name without `.md`), or null for another path. */
export function sessionIdOf(file) {
  const match = SESSIONS_DIR.exec(file.replace(/\\/g, '/'));
  return match ? match[2] : null;
}

/** The line of each top-level key of the front matter. */
function keyLines(text) {
  const lines = new Map();
  const rows = text.split(/\r?\n/);
  for (let index = 1; index < rows.length && rows[index] !== '---'; index += 1) {
    const key = /^([\w]+):/.exec(rows[index]);
    if (key) lines.set(key[1], index + 1);
  }
  return lines;
}

function charterProblems(charter, pack, problem, at, title) {
  for (const key of REQUIRED_KEYS) {
    if (charter[key] === undefined || charter[key] === null)
      problem(title, `the charter needs \`${key}\``);
  }
  if (charter.mission !== undefined && !String(charter.mission).trim())
    problem(at('mission'), '`mission` says in a sentence what the session looks for');
  if (charter.pack !== undefined && charter.pack !== pack)
    problem(at('pack'), `\`pack\` is "${charter.pack}", but the sheet is in the folder of ${pack}`);
  if (charter.environment !== undefined) {
    if (!NAME.test(String(charter.environment)))
      problem(at('environment'), '`environment` names a qa-config environment');
    else if (/^prod/i.test(charter.environment))
      problem(at('environment'), '`environment` looks like production; a session never runs there');
  }
  if (charter.routes !== undefined) {
    const routes = Array.isArray(charter.routes) ? charter.routes : [];
    if (routes.length === 0 || routes.some((route) => !String(route).startsWith('/')))
      problem(at('routes'), '`routes` lists the routes to start from, each starting with /');
  }
  if (charter.role !== undefined && !NAME.test(String(charter.role)))
    problem(at('role'), '`role` is one actor of the pack, or anonymous');
  if (charter.device !== undefined && !NAME.test(String(charter.device)))
    problem(at('device'), '`device` names a device project, such as desktop-chromium');
  if (charter.driver !== undefined && !DRIVERS.includes(charter.driver))
    problem(at('driver'), `\`driver\` is one of ${DRIVERS.join(', ')}`);
  if (charter.writes !== undefined && !WRITES.includes(charter.writes))
    problem(at('writes'), `\`writes\` is one of ${WRITES.join(', ')}`);
  if (charter.out_of_bounds !== undefined && !Array.isArray(charter.out_of_bounds))
    problem(at('out_of_bounds'), '`out_of_bounds` is a list, empty when nothing is');
  if (charter.minutes !== undefined) {
    const { most } = timeBox(charter.driver);
    const who = charter.driver === 'person' ? 'a person' : 'an agent';
    if (!Number.isInteger(charter.minutes) || charter.minutes < 1)
      problem(at('minutes'), '`minutes` is a whole number of minutes');
    else if (charter.minutes > most)
      problem(
        at('minutes'),
        `\`minutes\` is ${charter.minutes}; a session ${who} drives lasts ${most} at most. More time is a new charter`,
      );
  }
}

/** The `## ` sections of the body: `{ title, line, lines: [{ text, line }] }`. */
function sections(text) {
  const out = [];
  let current = null;
  let fenced = false;
  text.split(/\r?\n/).forEach((row, index) => {
    if (/^\s*```/.test(row)) fenced = !fenced;
    if (!fenced && /^## /.test(row)) {
      current = { title: row.slice(3).trim(), line: index + 1, lines: [] };
      out.push(current);
    } else if (current) current.lines.push({ text: row, line: index + 1 });
  });
  return out;
}

/** The findings under `## Findings`: `{ title, line, items: Map<item, { value, line }> }`. */
export function findingsOf(text) {
  const section = sections(text).find((s) => /^findings$/i.test(s.title));
  if (!section) return null;
  const findings = [];
  let current = null;
  for (const { text: row, line } of section.lines) {
    if (/^### /.test(row)) {
      current = { title: row.slice(4).trim(), line, items: new Map() };
      findings.push(current);
      continue;
    }
    const item = /^\s*[-*]\s+\**([A-Za-z]+)\**:\**\s*(.*)$/.exec(row);
    if (current && item && FINDING_ITEMS.includes(item[1]))
      current.items.set(item[1], { value: item[2].trim(), line });
  }
  return findings;
}

/** The line of the sheet's `# ` title after the front matter, or 1 when it has none. */
function titleLine(text) {
  const front = FRONT_MATTER.exec(text);
  const skipped = front ? front[0].split(/\r?\n/).length - 1 : 0;
  const rows = text.split(/\r?\n/);
  for (let index = skipped; index < rows.length; index += 1) {
    if (/^# /.test(rows[index])) return index + 1;
  }
  return 1;
}

/**
 * Parse one sheet. Never throws on content: every defect is a problem with a line number.
 * @param {string} text  the sheet
 * @param {string} file  its path relative to the repository root
 * @returns {{ id: string|null, charter: object|null, problems: { line: number, message: string }[] }}
 */
export function parseSheet(text, file) {
  const problems = [];
  const problem = (line, message) => problems.push({ line, message });
  // A problem of the sheet as a whole (a missing key or section, its name) points at its title.
  const title = titleLine(text);
  const path = file.replace(/\\/g, '/');
  const match = SESSIONS_DIR.exec(path);
  const id = match ? match[2] : null;
  if (!match) problem(title, 'a session sheet lives at apps/<pack>/docs/sessions/<date>-<slug>.md');
  else if (!SHEET_NAME.test(id)) problem(title, 'the sheet is named <yyyy-mm-dd>-<slug>.md');
  const front = FRONT_MATTER.exec(text);
  let charter = null;
  if (!front) problem(title, 'the sheet starts with its charter as YAML front matter');
  else {
    try {
      charter = parseYaml(front[1]) ?? {};
    } catch (error) {
      problem(title, `the charter is not valid YAML: ${error.message.split('\n')[0]}`);
    }
  }
  if (charter && typeof charter !== 'object') {
    problem(title, 'the charter is a YAML mapping');
    charter = null;
  }
  if (charter) {
    const lines = keyLines(text);
    charterProblems(charter, match?.[1], problem, (key) => lines.get(key) ?? title, title);
  }
  const findings = findingsOf(text);
  if (findings === null)
    problem(title, 'the sheet has a `## Findings` section, "None." when empty');
  for (const finding of findings ?? []) {
    const missing = FINDING_ITEMS.filter((item) => !finding.items.get(item)?.value);
    if (missing.length > 0)
      problem(
        finding.line,
        `finding "${finding.title}" lacks ${missing.join(', ')}; without evidence it is a question`,
      );
    const evidence = finding.items.get('Evidence');
    if (evidence?.value && id && !evidence.value.includes(`reports/explore/${id}/`))
      problem(evidence.line, `the evidence is a file under reports/explore/${id}/`);
  }
  if (charter?.writes === 'allowed' && !sections(text).some((s) => /^data created$/i.test(s.title)))
    problem(title, 'a writing session lists what it created under `## Data created`');
  return { id, charter, problems };
}

/**
 * The sheet with `entries` written into its front matter: a key already there gets the new value
 * on its line, a new key goes last. The rest of the text is left as it is.
 * @param {string} text
 * @param {Record<string, string>} entries
 */
export function stampSheet(text, entries) {
  const front = FRONT_MATTER.exec(text);
  if (!front) throw new Error('the sheet has no front matter to stamp');
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const rows = front[1].split(/\r?\n/);
  for (const [key, value] of Object.entries(entries)) {
    const at = rows.findIndex((row) => row.startsWith(`${key}:`));
    if (at >= 0) rows[at] = `${key}: ${value}`;
    else rows.push(`${key}: ${value}`);
  }
  return `---${newline}${rows.join(newline)}${newline}---${newline}${text.slice(front[0].length)}`;
}
