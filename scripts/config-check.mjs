#!/usr/bin/env node
/**
 * Checks qa-config against schemas/qa-config.schema.json and then the rules that span several
 * fields, which a JSON Schema cannot state. Every problem is listed at once, so a typo is reported
 * here instead of surfacing later as an unrelated runtime error.
 *
 *   node scripts/config-check.mjs            qa-config.json when present, else the example
 *   node scripts/config-check.mjs <file>...  the files given
 *   node scripts/config-check.mjs --all      the example, plus qa-config.json when present (gates)
 *
 * Exit codes: 0 every file is valid; 1 a file has problems or cannot be read.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { REPO_ROOT } from './lib/cli.mjs';

export const SCHEMA_PATH = join(REPO_ROOT, 'schemas', 'qa-config.schema.json');

const ajv = new Ajv2020({ allErrors: true, strict: true, useDefaults: false });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')));

/** A REVIEW band must sit on the safe side of FAIL, or it could never be reached. */
function qualityGateErrors(gate) {
  const errors = [];
  const passRate = gate.pass_rate;
  if (
    passRate?.review_below_pct !== undefined &&
    passRate.review_below_pct < passRate.fail_below_pct
  ) {
    errors.push(
      `quality_gate.pass_rate.review_below_pct (${passRate.review_below_pct}) is below fail_below_pct (${passRate.fail_below_pct}), so REVIEW can never happen`,
    );
  }
  for (const [impact, review] of Object.entries(gate.accessibility?.review_above ?? {})) {
    const fail = gate.accessibility.fail_above?.[impact];
    if (fail !== undefined && review > fail) {
      errors.push(
        `quality_gate.accessibility.review_above.${impact} (${review}) is above fail_above.${impact} (${fail})`,
      );
    }
  }
  const visual = gate.visual;
  if (visual?.review_above !== undefined && visual.review_above > visual.fail_above) {
    errors.push(
      `quality_gate.visual.review_above (${visual.review_above}) is above fail_above (${visual.fail_above})`,
    );
  }
  return errors;
}

function packErrors(at, pack) {
  const errors = [];
  if (pack.recovery && !pack.allow_writes) {
    errors.push(
      `${at}.recovery is set but allow_writes is false: destructive cases never run there`,
    );
  }
  const actors = Object.entries(pack.actors ?? {});
  for (const [name, actor] of actors) {
    if (actor?.account === 'provisioned' && !pack.allow_writes) {
      errors.push(
        `${at}.actors.${name} creates its account, which needs allow_writes: true (use an existing account here)`,
      );
    }
  }
  if (pack.default_actor && !actors.some(([name]) => name === pack.default_actor)) {
    errors.push(
      `${at}.default_actor "${pack.default_actor}" is not one of its actors: ${actors.map(([name]) => name).join(', ')}`,
    );
  }
  return errors;
}

/** The rules that span fields, as messages. */
export function semanticErrors(config) {
  const errors = [];
  const app = config.app ?? {};
  const environments = app.environments ?? {};
  if (app.environments && !(app.default_environment in environments)) {
    errors.push(
      `app.default_environment "${app.default_environment}" is not one of: ${Object.keys(environments).join(', ')}`,
    );
  }
  for (const [name, environment] of Object.entries(environments)) {
    for (const [pack, entry] of Object.entries(environment?.packs ?? {})) {
      errors.push(...packErrors(`app.environments.${name}.packs.${pack}`, entry ?? {}));
    }
  }
  const pattern = config.tracker?.key_pattern;
  if (typeof pattern === 'string') {
    try {
      new RegExp(pattern);
    } catch (error) {
      errors.push(`tracker.key_pattern is not a valid regex: ${error.message}`);
    }
  }
  if (config.policies?.commit?.require_tracker_key && !pattern) {
    errors.push('policies.commit.require_tracker_key is true but tracker.key_pattern is not set');
  }
  if (config.quality_gate) errors.push(...qualityGateErrors(config.quality_gate));
  return errors;
}

/** Schema problems followed by cross-field problems of a parsed configuration. */
export function configErrors(config) {
  const schemaErrors = validate(config)
    ? []
    : validate.errors.map((error) => {
        const extra = error.params?.additionalProperty;
        return `${error.instancePath || '(root)'} ${error.message}${extra ? `: "${extra}"` : ''}`;
      });
  // Cross-field rules assume the shapes the schema checks; they run only on a valid shape.
  return schemaErrors.length > 0 ? schemaErrors : semanticErrors(config);
}

function checkFile(file) {
  let config;
  try {
    config = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return [`cannot be read: ${error.message}`];
  }
  return configErrors(config);
}

/** The files a run checks, from its arguments. */
export function filesToCheck(args, root = REPO_ROOT) {
  const local = existsSync(join(root, 'qa-config.json'));
  if (args[0] === '--all') return ['qa-config.example.json', ...(local ? ['qa-config.json'] : [])];
  if (args.length > 0) return args;
  return [local ? 'qa-config.json' : 'qa-config.example.json'];
}

function main() {
  let failed = false;
  for (const file of filesToCheck(process.argv.slice(2))) {
    const errors = checkFile(file);
    if (errors.length === 0) {
      console.log(`config-check: ${file} is valid.`);
      continue;
    }
    failed = true;
    console.error(`config-check: ${file} has ${errors.length} problem(s):`);
    for (const error of errors) console.error(`  - ${error}`);
  }
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
