import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// What Claude Code is told about the repository: a rule, a skill or an agent nobody lists is never
// found, and an agent without a tool list inherits every tool, the ones that edit files included.

const ROOT = join(import.meta.dirname, '..', '..');
const guide = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
const AGENTS_DIR = join(ROOT, '.claude', 'agents');
const SKILLS_DIR = join(ROOT, '.claude', 'skills');
const EDIT_TOOLS = ['Write', 'Edit', 'NotebookEdit'];

const frontMatter = (text) => /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text)?.[1] ?? '';
const agents = () =>
  readdirSync(AGENTS_DIR)
    .filter((file) => file.endsWith('.md'))
    .map((file) => file.replace(/\.md$/, ''));
const skills = () =>
  readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
const skillText = (skill) => readFileSync(join(SKILLS_DIR, skill, 'SKILL.md'), 'utf8');

/** Rows of the agents table (`| Agent | Use it to | Writes |`): name -> the Writes cell. */
function agentRows(text) {
  const start = text.indexOf('| Agent | Use it to | Writes |');
  assert.ok(start >= 0, 'CLAUDE.md has an agents table');
  const table = text.slice(start).split(/\r?\n\r?\n/)[0];
  const rows = new Map();
  for (const match of table.matchAll(
    /^\| \[`([a-z][a-z0-9-]*)`\]\([^)]+\) \| [^|]+ \| ([^|]+) \|$/gm,
  ))
    rows.set(match[1], match[2].trim());
  return rows;
}

test('CLAUDE.md links every rule in .claude/rules', () => {
  const rules = readdirSync(join(ROOT, '.claude', 'rules')).filter((f) => f.endsWith('.md'));
  assert.ok(rules.length > 0);
  const missing = rules.filter((rule) => !guide.includes(`(.claude/rules/${rule})`));
  assert.deepEqual(missing, [], 'add each rule to the Rules table of CLAUDE.md');
});

test('every skill names itself and has a description; CLAUDE.md links every phase skill', () => {
  for (const skill of skills()) {
    const head = frontMatter(skillText(skill));
    assert.match(head, new RegExp(`^name: ${skill}$`, 'm'), `${skill}/SKILL.md names itself`);
    assert.match(head, /^description: /m, `${skill}/SKILL.md has a description`);
  }
  const missing = skills()
    .filter((skill) => skill.startsWith('qa-'))
    .filter((skill) => !guide.includes(`(.claude/skills/${skill}/SKILL.md)`));
  assert.deepEqual(missing, [], 'add each phase skill to the Skills table of CLAUDE.md');
});

test('every agent names itself, says when to use it and declares its tools', () => {
  assert.ok(agents().length > 0);
  for (const agent of agents()) {
    const head = frontMatter(readFileSync(join(AGENTS_DIR, `${agent}.md`), 'utf8'));
    assert.match(head, new RegExp(`^name: ${agent}$`, 'm'), `${agent}.md names itself`);
    assert.match(head, /^description: /m, `${agent}.md has a description`);
    assert.match(head, /^tools: \S/m, `${agent}.md declares its tools`);
  }
});

test('CLAUDE.md lists every agent, and an agent that writes nothing cannot edit files', () => {
  const rows = agentRows(guide);
  assert.deepEqual(
    agents().filter((agent) => !rows.has(agent)),
    [],
    'add each agent to the agents table of CLAUDE.md',
  );
  assert.deepEqual(
    [...rows.keys()].filter((name) => !agents().includes(name)),
    [],
    'every agent in CLAUDE.md has a file in .claude/agents',
  );
  for (const agent of agents().filter((name) => rows.get(name) === 'nothing')) {
    const head = frontMatter(readFileSync(join(AGENTS_DIR, `${agent}.md`), 'utf8'));
    const tools = (/^tools: (.*)$/m.exec(head)?.[1] ?? '').split(',').map((tool) => tool.trim());
    assert.deepEqual(
      tools.filter((tool) => EDIT_TOOLS.includes(tool)),
      [],
      `${agent} writes nothing, so it has no tool that edits files`,
    );
  }
});

test('every agent is named by a skill that launches it', () => {
  const texts = skills().map(skillText);
  const unlaunched = agents().filter(
    (agent) => !texts.some((text) => text.includes(`agents/${agent}.md`)),
  );
  assert.deepEqual(unlaunched, [], 'link each agent from the skill that launches it');
});

test('CLAUDE.md imports AGENTS.md, so both read the same project rules', () => {
  assert.match(guide, /^@AGENTS\.md$/m);
});
