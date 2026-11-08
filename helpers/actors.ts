// Actors: a role of the application, signed in without the UI. The core manages the life of a
// session (create the account when the role is provisioned, sign in once per worker, keep the
// browser state on disk, open signed-in contexts, remove the account at the end); each pack says
// how its application does those steps through an ActorProvider in its fixtures.ts.

import { randomBytes } from 'node:crypto';
import type { APIRequestContext, BrowserContext } from '@playwright/test';
import { statePath } from '../scripts/lib/auth-state.mjs';
import { missingVariableMessage } from '../scripts/lib/env-names.mjs';
import type { ActorConfig, QaRuntime } from './config';
import { rememberSecret } from './run-secrets';

function variable(env: NodeJS.ProcessEnv, name: string, why: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(missingVariableMessage(why, name));
  return value;
}

/** The browser state Playwright saves and restores: cookies and local storage per origin. */
export type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

export interface Account {
  username: string;
  password: string;
  /** The application's own id for the account, when the pack needs it to remove it. */
  id?: string;
}

export interface SignedIn {
  /** What the browser needs to be signed in: a session cookie, a token in local storage. */
  storageState: StorageState;
  /** Headers the pack's API client needs for the same session, such as a bearer token. */
  apiHeaders?: Record<string, string>;
  /** Secret values this session produced (tokens), removed from every piece of evidence. */
  secrets?: string[];
  /**
   * Session storage the application expects, per origin. Playwright's saved state does not keep
   * it, so the core writes it into every page of the actor before the application's scripts run.
   */
  sessionStorage?: { origin: string; items: Record<string, string> }[];
}

export interface ActorContext {
  /** A request context on the pack's base URL, without a session. */
  api: APIRequestContext;
  qa: QaRuntime;
  role: string;
  /** The parallel worker, so names created by two workers never collide. */
  worker: number;
  /** An account a case built, for `provision` to create instead of one of its own. */
  account?: Account;
}

export interface ActorProvider {
  /**
   * Prepare every browser context of the pack, signed in or not: cookies that dismiss a welcome or
   * consent banner, a language. Runs before the first page opens.
   */
  prepareContext?(context: BrowserContext, qa: QaRuntime): Promise<void>;
  /** Create a fresh account for a role whose account is `provisioned`. */
  provision?(context: ActorContext): Promise<Account>;
  /** Turn an account into a session, through the API or by building the cookie the app expects. */
  signIn(context: ActorContext & { account: Account }): Promise<SignedIn>;
  /** Remove an account the provider created. Runs once per worker, at the end. */
  remove?(context: ActorContext & { account: Account; session: SignedIn }): Promise<void>;
}

/** The account of an `existing` actor, read from the variables its entry names. */
export function existingAccount(
  actor: Extract<ActorConfig, { account: 'existing' }>,
  role: string,
  env: NodeJS.ProcessEnv = process.env,
): Account {
  const why = `Actor "${role}"`;
  return {
    username: variable(env, actor.username_env, why),
    password: variable(env, actor.password_env, why),
  };
}

/**
 * A suffix for names a provider creates (`customer-<suffix>@example.test`): unique per run and
 * worker, and readable in a report.
 */
export function uniqueSuffix(worker: number): string {
  return `${Date.now().toString(36)}-w${worker}-${randomBytes(3).toString('hex')}`;
}

/** A password for a provisioned account: random, long, with every character class. */
export function generatedPassword(): string {
  const password = `Qa-${randomBytes(12).toString('base64url')}-9a`;
  // Remembered for the run, so the artifacts are redacted of it even when a spec types it.
  rememberSecret(password);
  return password;
}

/** Where a worker keeps a role's browser state: `.auth/<env>/<pack>/<role>-<worker>.json`. */
export function storageStatePath(
  authDir: string,
  qa: QaRuntime,
  role: string,
  worker: number,
): string {
  return statePath(authDir, qa.environment, qa.pack, role, worker);
}
