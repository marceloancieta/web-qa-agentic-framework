// Feature contracts: what intake learned about a feature, one Markdown file per feature under
// apps/<pack>/docs/features/. Most of a contract is prose for design to read; its business rules are
// also data, because the cases trace back to them:
//
//   ## Business rules
//
//   | ID | Rule | Source |
//   |---|---|---|
//   | REQ-LOGIN-01 | A wrong password gets a message that does not say which part was wrong | the story; measured on the login form |
//
// The contract owns the rule ids. A registry whose `contract` header names the file cites them in
// its Requirement column directly, and traceability reports a rule no case cites. The format of the
// whole document is in docs/templates/feature-contract.md.

import { tableCells } from './text.mjs';

export const RULE_COLUMNS = ['ID', 'Rule', 'Source'];

const RULE_ID = /^REQ-[A-Z][A-Z0-9]{1,9}-\d{2,3}$/;

/**
 * The business rules of a contract, `{ id, text, source, line }`, and its problems, each with a line
 * number. Never throws on content.
 */
export function parseContractRules(text, file = 'contract.md') {
  const rules = [];
  const problems = [];
  const problem = (line, message) => problems.push({ file, line, message });
  const lines = text.split(/\r?\n/);
  const heading = lines.findIndex((line) => /^##\s+Business rules\s*$/.test(line));
  if (heading === -1) {
    problem(1, 'missing "## Business rules" section');
    return { file, rules, problems };
  }
  let index = heading + 1;
  while (index < lines.length && !lines[index].trim().startsWith('|')) {
    if (/^#{1,2}\s/.test(lines[index])) break;
    index += 1;
  }
  if (tableCells(lines[index] ?? '').join('|') !== RULE_COLUMNS.join('|')) {
    problem(heading + 1, `the business rules need a table: | ${RULE_COLUMNS.join(' | ')} |`);
    return { file, rules, problems };
  }
  index += 2; // header and separator
  const seen = new Set();
  for (; index < lines.length && lines[index].trim().startsWith('|'); index += 1) {
    const line = index + 1;
    const cells = tableCells(lines[index]);
    if (cells.length !== RULE_COLUMNS.length) {
      problem(line, `row has ${cells.length} cells, expected ${RULE_COLUMNS.length}; row skipped`);
      continue;
    }
    const [id, ruleText, source] = cells;
    if (!RULE_ID.test(id)) problem(line, `rule id "${id}" must be REQ-<FEATURE>-NN`);
    if (seen.has(id)) problem(line, `duplicate rule id ${id}`);
    if (!ruleText) problem(line, `${id}: the rule is empty`);
    if (!source) problem(line, `${id}: every rule names its source`);
    seen.add(id);
    rules.push({ id, text: ruleText, source, line });
  }
  if (rules.length === 0) problem(heading + 1, 'the business rules table has no rows');
  return { file, rules, problems };
}
