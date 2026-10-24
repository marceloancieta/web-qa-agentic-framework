// The runtime view of qa-config: the active environment, the devices it runs and, for one app pack,
// where it lives and which accounts its actors use. qa-config.json is per machine and ignored by
// git; without it the tracked example is in effect. Validation is `npm run config:check`'s job;
// this module only reads. The pack always comes from the caller (a project's metadata).

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEFAULT_DEVICES, isDeviceName, type DeviceName } from './devices';

export const REPO_ROOT = resolve(__dirname, '..');

export type ActorConfig =
  | { account: 'provisioned'; role?: string }
  | { account: 'existing'; username_env: string; password_env: string };

export interface RecoveryConfig {
  command: string;
  ready_timeout_s?: number;
}

interface PackEntry {
  base_url: string;
  allow_writes?: boolean;
  recovery?: RecoveryConfig;
  actors: Record<string, ActorConfig>;
  default_actor?: string;
}

interface QaConfigFile {
  app?: {
    default_environment?: string;
    environments?: Record<string, { projects?: string[]; packs?: Record<string, PackEntry> }>;
    accessibility?: { tags?: string[] };
  };
  test_management?: { provider?: string };
  tracker?: { key_pattern?: string | null; issue_url?: string | null };
}

export const ANONYMOUS_ACTOR = 'anonymous';
export const DEFAULT_A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa'];

/** What qa-config says for every pack. */
export interface QaSettings {
  /** The file the values came from, so a report can say which config a run used. */
  source: string;
  environment: string;
  devices: DeviceName[];
  accessibilityTags: string[];
  testManagement: string;
  tracker: { keyPattern: string | null; issueUrl: string | null };
}

/** The settings plus one pack's entry in the active environment. */
export interface QaRuntime extends QaSettings {
  pack: string;
  baseUrl: string;
  allowWrites: boolean;
  recovery: RecoveryConfig | null;
  actors: Record<string, ActorConfig>;
  defaultActor: string;
}

/** Load the local env file into `process.env`; variables already set win. A missing file is normal. */
export function loadLocalEnvFile(root = REPO_ROOT): void {
  try {
    process.loadEnvFile(join(root, '.env'));
  } catch {
    // No local env file: everything comes from the real environment.
  }
}

function readConfigFile(root: string): { file: QaConfigFile; source: string } {
  for (const name of ['qa-config.json', 'qa-config.example.json']) {
    let text: string;
    try {
      text = readFileSync(join(root, name), 'utf8');
    } catch {
      continue;
    }
    return { file: JSON.parse(text) as QaConfigFile, source: name };
  }
  throw new Error(`No qa-config.json or qa-config.example.json in ${root}. Copy the example.`);
}

/** The variable that overrides a pack's base URL for one run: `QA_JUICE_SHOP_BASE_URL`. */
export function packVariable(pack: string, setting: 'BASE_URL'): string {
  return `QA_${pack.toUpperCase().replace(/-/g, '_')}_${setting}`;
}

function selectEnvironment(file: QaConfigFile, source: string, env: NodeJS.ProcessEnv) {
  const app = file.app ?? {};
  const environment = env.QA_ENV || app.default_environment || '';
  const selected = app.environments?.[environment];
  if (!selected) {
    const known = Object.keys(app.environments ?? {}).join(', ') || '(none)';
    throw new Error(`${source}: environment "${environment}" is not defined. Known: ${known}.`);
  }
  const listed = selected.projects ?? DEFAULT_DEVICES;
  const unknown = listed.filter((name) => !isDeviceName(name));
  if (unknown.length > 0) {
    throw new Error(
      `${source}: environment "${environment}" lists unknown projects: ${unknown.join(', ')}.`,
    );
  }
  return { environment, devices: listed as DeviceName[], packs: selected.packs ?? {} };
}

/** The settings shared by every pack. QA_ENV picks the environment. */
export function loadSettings(env: NodeJS.ProcessEnv = process.env, root = REPO_ROOT): QaSettings {
  const { file, source } = readConfigFile(root);
  const { environment, devices } = selectEnvironment(file, source, env);
  return {
    source,
    environment,
    devices,
    accessibilityTags: file.app?.accessibility?.tags ?? DEFAULT_A11Y_TAGS,
    testManagement: file.test_management?.provider ?? 'local',
    tracker: {
      keyPattern: file.tracker?.key_pattern ?? null,
      issueUrl: file.tracker?.issue_url ?? null,
    },
  };
}

/** The packs the active environment configures. */
export function configuredPacks(env: NodeJS.ProcessEnv = process.env, root = REPO_ROOT): string[] {
  const { file, source } = readConfigFile(root);
  return Object.keys(selectEnvironment(file, source, env).packs);
}

/**
 * One pack in the active environment. A pack the environment does not configure is an error that
 * names the environment and the packs it does configure; there is no global fallback.
 */
export function loadRuntime(
  pack: string,
  env: NodeJS.ProcessEnv = process.env,
  root = REPO_ROOT,
): QaRuntime {
  const { file, source } = readConfigFile(root);
  const { environment, packs } = selectEnvironment(file, source, env);
  const entry = packs[pack];
  if (!entry) {
    const known = Object.keys(packs).join(', ') || '(none)';
    throw new Error(
      `${source}: environment "${environment}" has no entry for pack "${pack}" ` +
        `(app.environments.${environment}.packs.${pack}). Configured packs: ${known}.`,
    );
  }
  const actorNames = Object.keys(entry.actors ?? {});
  return {
    ...loadSettings(env, root),
    pack,
    baseUrl: (env[packVariable(pack, 'BASE_URL')] || entry.base_url).replace(/\/+$/, ''),
    allowWrites: entry.allow_writes ?? false,
    recovery: entry.recovery ?? null,
    actors: entry.actors ?? {},
    defaultActor: entry.default_actor ?? actorNames[0] ?? ANONYMOUS_ACTOR,
  };
}

/** The account settings of an actor; `null` for the built-in anonymous one. */
export function actorConfig(qa: QaRuntime, name: string): ActorConfig | null {
  if (name === ANONYMOUS_ACTOR) return null;
  const actor = qa.actors[name];
  if (!actor) {
    const known = [ANONYMOUS_ACTOR, ...Object.keys(qa.actors)].join(', ');
    throw new Error(
      `Actor "${name}" is not defined in ${qa.source} ` +
        `app.environments.${qa.environment}.packs.${qa.pack}.actors. Known: ${known}.`,
    );
  }
  return actor;
}

/** Names of the variables an actor needs. Names only: values never leave the process. */
export function requiredEnvVars(actor: ActorConfig | null): string[] {
  return actor?.account === 'existing' ? [actor.username_env, actor.password_env] : [];
}

/** Names from `names` that are unset or blank. A blank value is a broken binding, not a value. */
export function missingEnvVars(names: string[], env: NodeJS.ProcessEnv = process.env): string[] {
  return names.filter((name) => !env[name]?.trim());
}

/** The pack a project runs, from its `metadata.pack`; projects such as `unit` have none. */
export function projectPack(project: { name: string; metadata?: Record<string, unknown> }): string {
  const pack = project.metadata?.pack;
  if (typeof pack !== 'string' || !pack) {
    throw new Error(
      `Project "${project.name}" has no app pack (metadata.pack), so no pack configuration can be ` +
        'read. Pack fixtures run only in the <pack>-<device> projects.',
    );
  }
  return pack;
}
