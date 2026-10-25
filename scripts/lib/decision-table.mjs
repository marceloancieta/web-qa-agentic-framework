// Decision tables: the cases whose result depends on a combination of conditions keep the table in
// apps/<pack>/rules/<case id>.yaml, one rule per row, and the spec walks it. The file is named after
// the registry case that owns it:
//
//   conditions:                     each condition and the values it takes (two or more)
//     email: [empty, filled]
//     password: [empty, filled]
//   actions:                        each observable result and the values it takes
//     login: [disabled, enabled]
//   rules:                          `when` names every condition, `-` for any value;
//     - when: { email: empty, password: '-' }       `then` gives every action a value
//       then: { login: disabled }
//
// A complete table covers every combination of condition values, and no two rules give the same
// combination different actions. Two rules that agree on an overlap are allowed: a `-` row and a
// row it includes say the same thing twice, which is redundant but not wrong.

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { LineCounter, parseDocument } from 'yaml';

export const ANY = '-';
export const TABLE_KEYS = ['conditions', 'actions', 'rules'];
/** More combinations than a reviewer can check row by row: split the table. */
export const MAX_COMBINATIONS = 64;
const NAME = /^[a-z][a-z0-9_]*$/;
const CASE_ID = /^TC-[A-Z][A-Z0-9]{1,9}-\d{2,3}$/;

const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const show = (combination) =>
  Object.entries(combination)
    .map(([name, value]) => `${name}=${value}`)
    .join(', ');

/** The value lists of `conditions` or `actions`, with a problem for each malformed entry. */
function valueLists(section, key, problem, line) {
  if (!isMap(section) || Object.keys(section).length === 0) {
    problem(line, `\`${key}\` must map each name to the list of values it takes`);
    return null;
  }
  const lists = {};
  for (const [name, values] of Object.entries(section)) {
    const strings = Array.isArray(values) ? values.map(String) : [];
    if (!NAME.test(name)) problem(line, `${key}.${name}: names are lower_snake_case`);
    if (strings.length < 2 || new Set(strings).size !== strings.length || strings.includes(ANY)) {
      problem(line, `${key}.${name} must list two or more distinct values, none of them "${ANY}"`);
      continue;
    }
    lists[name] = strings;
  }
  return lists;
}

/** Every combination of the condition values, in the order the table lists them. */
export function combinations(conditions) {
  return Object.entries(conditions).reduce(
    (rows, [name, values]) => rows.flatMap((row) => values.map((v) => ({ ...row, [name]: v }))),
    [{}],
  );
}

const matches = (when, combination) =>
  Object.entries(when).every(([name, value]) => value === ANY || combination[name] === value);

/**
 * Parse one table. Never throws on content: a malformed table returns its problems
 * (`decision-table-shape`), a well-formed one the combinations no rule covers
 * (`decision-table-gap`, at the `rules` key) and the ones two rules decide differently
 * (`decision-table-conflict`, at the later rule).
 */
export function parseDecisionTable(text, file = 'TC-TABLE-01.yaml') {
  const problems = [];
  const problem = (rule) => (line, message) => problems.push({ rule, file, line, message });
  const shape = problem('decision-table-shape');
  const id = basename(file).replace(/\.ya?ml$/, '');
  const table = { file, id, conditions: {}, actions: {}, rules: [], problems };
  if (!CASE_ID.test(id)) shape(1, `the file is named after its case: TC-<FEATURE>-NN.yaml`);

  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });
  const lineOf = (node) => (node?.range ? lineCounter.linePos(node.range[0]).line : 1);
  if (doc.errors.length > 0) {
    const [error] = doc.errors;
    shape(error.linePos?.[0]?.line ?? 1, `not valid YAML: ${error.message.split('\n')[0]}`);
    return table;
  }
  const data = doc.toJS() ?? {};
  if (!isMap(data)) {
    shape(1, `a table is a map with ${TABLE_KEYS.join(', ')}`);
    return table;
  }
  const keyLine = (key) => {
    const pair = doc.contents?.items?.find((item) => item.key?.value === key);
    return lineOf(pair?.key);
  };
  for (const key of Object.keys(data).filter((k) => !TABLE_KEYS.includes(k)))
    shape(keyLine(key), `key \`${key}\` is not one of ${TABLE_KEYS.join(', ')}`);
  const conditions = valueLists(data.conditions, 'conditions', shape, keyLine('conditions'));
  const actions = valueLists(data.actions, 'actions', shape, keyLine('actions'));
  const rulesLine = keyLine('rules');
  if (!Array.isArray(data.rules) || data.rules.length === 0) {
    shape(rulesLine, '`rules` must list at least one rule');
    return table;
  }
  if (!conditions || !actions) return table;
  table.conditions = conditions;
  table.actions = actions;
  const total = Object.values(conditions).reduce((n, values) => n * values.length, 1);
  if (total > MAX_COMBINATIONS)
    shape(
      keyLine('conditions'),
      `${total} combinations; split the table (at most ${MAX_COMBINATIONS})`,
    );

  const items = doc.get('rules', true)?.items ?? [];
  data.rules.forEach((rule, index) => {
    const line = lineOf(items[index]);
    const before = problems.length;
    const when = isMap(rule?.when) ? rule.when : null;
    const then = isMap(rule?.then) ? rule.then : null;
    if (!when || !then) shape(line, `rule ${index + 1} needs a \`when\` map and a \`then\` map`);
    for (const [part, given, lists, allowAny] of [
      ['when', when, conditions, true],
      ['then', then, actions, false],
    ]) {
      if (!given) continue;
      for (const name of Object.keys(lists).filter((n) => !(n in given)))
        shape(
          line,
          `rule ${index + 1}: ${part} has no value for ${name}${allowAny ? ` (use "${ANY}" for any)` : ''}`,
        );
      for (const [name, raw] of Object.entries(given)) {
        const value = String(raw);
        if (!(name in lists)) shape(line, `rule ${index + 1}: ${part}.${name} is not declared`);
        else if (!lists[name].includes(value) && !(allowAny && value === ANY))
          shape(
            line,
            `rule ${index + 1}: ${part}.${name} "${value}" is not one of ${lists[name].join(', ')}`,
          );
      }
    }
    if (problems.length === before) {
      const stringify = (map) =>
        Object.fromEntries(Object.entries(map).map(([k, v]) => [k, String(v)]));
      table.rules.push({ line, index: index + 1, when: stringify(when), then: stringify(then) });
    }
  });
  if (problems.length > 0) return table;

  const missing = [];
  const conflicts = new Map();
  for (const combination of combinations(conditions)) {
    const covering = table.rules.filter((rule) => matches(rule.when, combination));
    if (covering.length === 0) missing.push(combination);
    const [first] = covering;
    for (const rule of covering.slice(1)) {
      if (show(rule.then) === show(first.then) || conflicts.has(rule.index)) continue;
      conflicts.set(rule.index, true);
      problem('decision-table-conflict')(
        rule.line,
        `rule ${rule.index} gives ${show(combination)} ${show(rule.then)}; rule ${first.index} gives ${show(first.then)}`,
      );
    }
  }
  if (missing.length > 0) {
    const listed = missing
      .slice(0, 3)
      .map((c) => `{${show(c)}}`)
      .join('; ');
    problem('decision-table-gap')(
      rulesLine,
      `${missing.length} combination(s) no rule covers: ${listed}${missing.length > 3 ? '; ...' : ''}`,
    );
  }
  return table;
}

/**
 * Every combination of a table with the actions its rule gives, for a spec to walk. Throws when the
 * table has a problem: a spec never runs a table the linter would refuse.
 * @returns {{ when: Record<string, string>, then: Record<string, string> }[]}
 */
export function expandRules(table) {
  if (table.problems.length > 0) {
    const [first] = table.problems;
    throw new Error(`${first.file}:${first.line} ${first.message}`);
  }
  return combinations(table.conditions).map((when) => ({
    when,
    then: table.rules.find((rule) => matches(rule.when, when)).then,
  }));
}

/** Read, check and expand a table file. */
export function loadDecisionTable(path) {
  return expandRules(parseDecisionTable(readFileSync(path, 'utf8'), path));
}
