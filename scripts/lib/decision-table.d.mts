// Types for scripts/lib/decision-table.mjs.

export interface TableProblem {
  rule: 'decision-table-shape' | 'decision-table-gap' | 'decision-table-conflict';
  file: string;
  line: number;
  message: string;
}
export interface TableRule {
  line: number;
  index: number;
  when: Record<string, string>;
  then: Record<string, string>;
}
export interface DecisionTable {
  file: string;
  id: string;
  conditions: Record<string, string[]>;
  actions: Record<string, string[]>;
  rules: TableRule[];
  problems: TableProblem[];
}
export interface TableStep {
  when: Record<string, string>;
  then: Record<string, string>;
}

export const ANY: string;
export const TABLE_KEYS: string[];
export const MAX_COMBINATIONS: number;
export function combinations(conditions: Record<string, string[]>): Record<string, string>[];
export function parseDecisionTable(text: string, file?: string): DecisionTable;
export function expandRules(table: DecisionTable): TableStep[];
export function loadDecisionTable(path: string): TableStep[];
