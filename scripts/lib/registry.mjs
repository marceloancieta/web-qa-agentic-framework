// Registries: the reviewed list of a feature's designed cases, one Markdown file per feature under
// apps/<pack>/registry/. People review them as documents and the tools read them as data, so the
// shape is strict:
//
//   ---                                       YAML front matter
//   feature: LOGIN                            case ids are TC-<feature>-NN
//   title: Sign-in and sign-up
//   routes: [/#/login, /#/register]           the routes the cases visit
//   contract: docs/features/login.md          optional; the feature contract, relative to the pack
//   actors: [anonymous, customer]             optional; the roles the cases act as
//   dimensions:                               every UI quality dimension, `applies` or `n/a: <why>`
//     responsive: applies
//     perf: 'n/a: no loading state on these routes'
//     ...
//   requirements:                             optional; what the cases trace back to
//     - { id: REQ-LOGIN-01, text: ... }
//   test_data:                                optional; each placeholder the cases use
//     <EMAIL>: an address the builder makes unique per run
//   ---
//   ...free text...
//   ## Cases
//   | ID | Title | Requirement | Technique | Priority | Tags | Devices | Status | Spec | Defect |
//
// Tags are the case's tags, space separated; Devices is `all`, or `desktop-only: <why>` or
// `mobile-only: <why>` for a real difference in behaviour, matched by the tag of the same name.
// The shape of the table is read first: a row with the wrong number of cells is reported and
// skipped, never read with shifted columns.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { DESKTOP_ONLY_TAG, DIMENSIONS, LAYER_TAGS, MOBILE_ONLY_TAG, TAGS } from './tags.mjs';

export const COLUMNS = [
  'ID',
  'Title',
  'Requirement',
  'Technique',
  'Priority',
  'Tags',
  'Devices',
  'Status',
  'Spec',
  'Defect',
];

/** draft -> approved -> automated -> published; blocked at any point, with a defect key. */
export const STATUSES = ['draft', 'approved', 'automated', 'published', 'blocked'];
export const TECHNIQUES = [
  'equivalence-partition',
  'boundary-value',
  'decision-table',
  'state-transition',
  'pairwise',
  'error-guessing',
  'use-case',
  'exploratory',
];
export const PRIORITIES = ['high', 'medium', 'low'];
export const HEADER_KEYS = [
  'feature',
  'title',
  'routes',
  'contract',
  'actors',
  'dimensions',
  'requirements',
  'test_data',
];

const FEATURE = /^[A-Z][A-Z0-9]{1,9}$/;
const ACTOR = /^[a-z][a-z0-9-]*$/;
const PLACEHOLDER = /^<[A-Z][A-Z0-9_]*>$/;
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
const NOT_APPLICABLE = /^n\/a:\s*\S/;
const DEVICES = /^(?:all|(desktop-only|mobile-only):\s*(\S.*))$/;

/**
 * The line of each key in the front matter: top-level keys by name, nested ones as
 * `parent.child`, so a problem points at the line to fix.
 */
function frontMatterLines(text) {
  const lines = new Map();
  let parent = null;
  const rows = text.split(/\r?\n/);
  for (let index = 1; index < rows.length && rows[index] !== '---'; index += 1) {
    const top = /^([\w]+):/.exec(rows[index]);
    if (top) {
      parent = top[1];
      lines.set(parent, index + 1);
      continue;
    }
    const nested = /^\s+(<?[\w]+>?):/.exec(rows[index]);
    if (nested && parent) lines.set(`${parent}.${nested[1]}`, index + 1);
  }
  return lines;
}

function splitRow(line) {
  // `| a | b |` -> ['a', 'b']; an escaped pipe stays inside its cell, and an HTML comment after
  // the last pipe is a reviewer's note, not a cell.
  const inner = line
    .trim()
    .replace(/\s*<!--.*?-->$/, '')
    .replace(/^\|/, '')
    .replace(/\|$/, '');
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function headerProblems(meta, problem, at) {
  if (!FEATURE.test(String(meta.feature ?? ''))) {
    problem(at('feature'), 'front matter `feature` must be 2-10 capitals or digits, such as LOGIN');
  }
  if (!meta.title) problem(at('title'), 'front matter `title` is required');
  if (
    !Array.isArray(meta.routes) ||
    meta.routes.length === 0 ||
    !meta.routes.every((r) => String(r).startsWith('/'))
  ) {
    problem(
      at('routes'),
      'front matter `routes` must list the routes the cases visit, each starting with /',
    );
  }
  for (const key of Object.keys(meta)) {
    if (!HEADER_KEYS.includes(key))
      problem(at(key), `front matter key \`${key}\` is not one of ${HEADER_KEYS.join(', ')}`);
  }
  if (meta.contract !== undefined && !/^[\w./-]+\.md$/.test(String(meta.contract))) {
    problem(
      at('contract'),
      'front matter `contract` must be the path of a Markdown file, relative to the pack',
    );
  }
  if (
    meta.actors !== undefined &&
    !(Array.isArray(meta.actors) && meta.actors.every((a) => ACTOR.test(a)))
  ) {
    problem(
      at('actors'),
      'front matter `actors` must list role names, such as [anonymous, customer]',
    );
  }
  const dimensions = meta.dimensions && typeof meta.dimensions === 'object' ? meta.dimensions : {};
  for (const name of Object.keys(DIMENSIONS)) {
    const value = dimensions[name];
    if (value === undefined)
      problem(at('dimensions'), `dimensions.${name} is missing: write applies, or n/a: <why>`);
    else if (value !== 'applies' && !NOT_APPLICABLE.test(String(value))) {
      problem(at(`dimensions.${name}`), `dimensions.${name} must be applies, or n/a: <why>`);
    }
  }
  for (const name of Object.keys(dimensions)) {
    if (!(name in DIMENSIONS))
      problem(
        at(`dimensions.${name}`),
        `dimensions.${name} is not a dimension: ${Object.keys(DIMENSIONS).join(', ')}`,
      );
  }
  if (meta.test_data !== undefined) {
    const entries =
      meta.test_data && typeof meta.test_data === 'object' ? Object.entries(meta.test_data) : [];
    for (const [name, meaning] of entries) {
      if (!PLACEHOLDER.test(name))
        problem(
          at(`test_data.${name}`),
          `test_data placeholder "${name}" must look like <UPPER_SNAKE>`,
        );
      if (typeof meaning !== 'string' || !meaning.trim())
        problem(at(`test_data.${name}`), `test_data placeholder ${name} needs a description`);
    }
  }
}

function rowProblems(row, requirementIds, problem, line) {
  const known = new Set(TAGS);
  if (!row.title) problem(line, `${row.id}: title is empty`);
  if (!STATUSES.includes(row.status))
    problem(line, `${row.id}: status "${row.status}" is not one of ${STATUSES.join(', ')}`);
  if (!TECHNIQUES.includes(row.technique))
    problem(line, `${row.id}: technique "${row.technique}" is not one of ${TECHNIQUES.join(', ')}`);
  if (!PRIORITIES.includes(row.priority))
    problem(line, `${row.id}: priority "${row.priority}" is not one of ${PRIORITIES.join(', ')}`);
  if (row.requirement && !requirementIds.has(row.requirement)) {
    problem(line, `${row.id}: requirement ${row.requirement} is not declared in the front matter`);
  }
  for (const tag of row.tagList.filter((tag) => !known.has(tag)))
    problem(line, `${row.id}: tag ${tag} is not in the taxonomy`);
  const layers = row.tagList.filter((tag) => LAYER_TAGS.includes(tag));
  if (layers.length !== 1)
    problem(line, `${row.id}: needs exactly one of ${LAYER_TAGS.join(', ')}`);
  const devices = DEVICES.exec(row.devices);
  if (!devices)
    problem(line, `${row.id}: devices must be all, desktop-only: <why> or mobile-only: <why>`);
  for (const [tag, kind] of [
    [DESKTOP_ONLY_TAG, 'desktop-only'],
    [MOBILE_ONLY_TAG, 'mobile-only'],
  ]) {
    if (row.tagList.includes(tag) !== (devices?.[1] === kind)) {
      problem(line, `${row.id}: the ${tag} tag and devices "${kind}: <why>" go together`);
    }
  }
  if (row.status === 'blocked' && !row.defect)
    problem(line, `${row.id}: a blocked case names its defect`);
  if (['automated', 'published'].includes(row.status) && !row.spec) {
    problem(line, `${row.id}: an ${row.status} case names its spec file`);
  }
}

/** Parse one registry. Never throws on content: every defect is a problem with a line number. */
export function parseRegistry(text, file = 'registry.md') {
  const problems = [];
  const problem = (line, message) => problems.push({ file, line, message });
  const front = FRONT_MATTER.exec(text);
  let meta = {};
  if (!front) problem(1, 'missing YAML front matter (--- ... ---)');
  else {
    try {
      meta = parseYaml(front[1]) ?? {};
    } catch (error) {
      problem(1, `front matter is not valid YAML: ${error.message.split('\n')[0]}`);
    }
  }
  const keyLines = frontMatterLines(text);
  headerProblems(meta, problem, (key) => keyLines.get(key) ?? keyLines.get(key.split('.')[0]) ?? 1);
  const requirements = Array.isArray(meta.requirements) ? meta.requirements : [];
  const requirementIds = new Set(requirements.map((r) => r?.id));

  const lines = text.split(/\r?\n/);
  const cases = [];
  const heading = lines.findIndex((line) => /^##\s+Cases\s*$/.test(line));
  if (heading === -1) {
    problem(1, 'missing "## Cases" section');
    return { file, meta, requirements, cases, problems, keyLines };
  }
  let index = heading + 1;
  while (index < lines.length && lines[index].trim() === '') index += 1;
  if (splitRow(lines[index] ?? '').join('|') !== COLUMNS.join('|')) {
    problem(index + 1, `the cases table header must be: | ${COLUMNS.join(' | ')} |`);
    return { file, meta, requirements, cases, problems, keyLines };
  }
  index += 2; // header and separator
  const seen = new Set();
  const casePattern = new RegExp(`^TC-${meta.feature ?? '[A-Z0-9]+'}-\\d{2,3}$`);
  for (; index < lines.length && lines[index].trim().startsWith('|'); index += 1) {
    const line = index + 1;
    const cells = splitRow(lines[index]);
    if (cells.length !== COLUMNS.length) {
      problem(line, `row has ${cells.length} cells, expected ${COLUMNS.length}; row skipped`);
      continue;
    }
    const row = Object.fromEntries(COLUMNS.map((column, i) => [column.toLowerCase(), cells[i]]));
    row.tagList = row.tags.split(/\s+/).filter(Boolean);
    if (!casePattern.test(row.id))
      problem(line, `case id "${row.id}" must be TC-${meta.feature}-NN`);
    if (seen.has(row.id)) problem(line, `duplicate case id ${row.id}`);
    seen.add(row.id);
    rowProblems(row, requirementIds, problem, line);
    cases.push({ ...row, line });
  }
  return { file, meta, requirements, cases, problems, keyLines };
}

/** The dimensions a registry declares as applying. */
export function applyingDimensions(registry) {
  const dimensions = registry.meta.dimensions ?? {};
  return Object.keys(DIMENSIONS).filter((name) => dimensions[name] === 'applies');
}

/** Every registry of every pack (or of one), parsed, with its pack. */
export function loadRegistries(root, pack = null) {
  const apps = join(root, 'apps');
  if (!existsSync(apps)) return [];
  const packs = pack
    ? [pack]
    : readdirSync(apps, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
  const registries = [];
  for (const name of packs.sort()) {
    const dir = join(apps, name, 'registry');
    if (!existsSync(dir)) continue;
    for (const fileName of readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()) {
      const file = join(dir, fileName);
      const parsed = parseRegistry(
        readFileSync(file, 'utf8'),
        relative(root, file).replace(/\\/g, '/'),
      );
      const contract = parsed.meta.contract;
      if (typeof contract === 'string' && !existsSync(join(apps, name, contract))) {
        parsed.problems.push({
          file: parsed.file,
          line: 1,
          message: `contract ${contract} does not exist in apps/${name}/`,
        });
      }
      registries.push({ pack: name, ...parsed });
    }
  }
  return registries;
}
