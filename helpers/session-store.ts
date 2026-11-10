// One worker's sessions of a pack: the account behind each role and the signed-in state its
// contexts open with. The `sessions` fixture (fixtures/index.ts) builds one per worker; it lives
// here so its life (sign in once or per context, write the browser state, remove what the worker
// created) is tested without a browser.
//
// - A role's account is created (provisioned) or read (existing) once per worker.
// - A reusable session is signed in once and shared by every context of the role; its state is
//   written when it is made, for the tools that walk as the role.
// - With `provider.singleUseSessions` every context after the first gets a new sign-in of the same
//   account, and `close()` writes one more session that no context used.
// - `fresh(role)` creates an account and session for one test, never written.
// - `close()` removes each provisioned account once, with its latest session.

import {
  existingAccount,
  type Account,
  type ActorContext,
  type ActorProvider,
  type SignedIn,
} from './actors';
import type { ActorConfig } from './config';

export interface Session {
  account: Account;
  signedIn: SignedIn;
  /** The browser state file written for this session, or null (fresh, or single-use). */
  file: string | null;
  provisioned: boolean;
}

export interface SessionStoreOptions {
  provider: ActorProvider;
  /** The provider's context for a role: the API client, the runtime, the worker. */
  contextOf(role: string): ActorContext;
  /** The role's actor configuration; null for the anonymous actor. */
  configOf(role: string): ActorConfig | null;
  /** Secrets the evidence must hide: an account's password and a session's tokens. */
  learn(secrets: string[]): void;
  /** Write the role's browser state for the tools that walk as it; returns the file. */
  write(role: string, signedIn: SignedIn): string;
  env?: NodeJS.ProcessEnv;
}

export interface SessionStore {
  get(role: string): Promise<Session>;
  fresh(role: string, built?: Account): Promise<Session>;
  /** Write the unused single-use sessions and remove the provisioned accounts. */
  close(): Promise<void>;
}

/** An account the worker used: its role and the latest session it was signed in with. */
interface Used {
  role: string;
  latest: Promise<Session>;
}

export function sessionStore(options: SessionStoreOptions): SessionStore {
  const { provider, contextOf, configOf, learn, write, env = process.env } = options;
  const singleUse = provider.singleUseSessions === true;
  /** The first session of each role: shared, or (single-use) the one the first context opened. */
  const shared = new Map<string, Promise<Session>>();
  /** Every account in the order the worker used them: the shared one of each role, and fresh ones. */
  const used: Used[] = [];
  /** The entry of `used` that holds each role's shared account. */
  const sharedUse = new Map<string, Used>();

  const accountOf = async (role: string, fresh: boolean, built?: Account) => {
    const config = configOf(role);
    if (!config) throw new Error('The anonymous actor has no session.');
    if (fresh && config.account !== 'provisioned') {
      throw new Error(
        `Actor "${role}" uses an existing account; only a provisioned role can be fresh.`,
      );
    }
    let account: Account;
    if (config.account === 'existing') account = existingAccount(config, role, env);
    else if (provider.provision)
      account = await provider.provision({
        ...contextOf(role),
        ...(built ? { account: built } : {}),
      });
    else
      throw new Error(
        `Actor "${role}" is provisioned, but the pack's provider cannot create accounts.`,
      );
    learn([account.password]);
    return { account, provisioned: config.account === 'provisioned' };
  };

  const signIn = async (role: string, account: Account): Promise<SignedIn> => {
    const signedIn = await provider.signIn({ ...contextOf(role), account });
    learn(signedIn.secrets ?? []);
    return signedIn;
  };

  const start = async (role: string): Promise<Session> => {
    const { account, provisioned } = await accountOf(role, false);
    const signedIn = await signIn(role, account);
    // A single-use session is spent by the context that opens it: its file is written at the end.
    return { account, signedIn, file: singleUse ? null : write(role, signedIn), provisioned };
  };

  return {
    get(role) {
      const first = shared.get(role);
      if (!first) {
        const pending = start(role);
        shared.set(role, pending);
        const entry = { role, latest: pending };
        used.push(entry);
        sharedUse.set(role, entry);
        return pending;
      }
      if (!singleUse) return first;
      const again = first.then(async (session): Promise<Session> => ({
        ...session,
        signedIn: await signIn(role, session.account),
      }));
      (sharedUse.get(role) as Used).latest = again;
      return again;
    },

    fresh(role, built) {
      const pending = (async (): Promise<Session> => {
        const { account } = await accountOf(role, true, built);
        return { account, signedIn: await signIn(role, account), file: null, provisioned: true };
      })();
      used.push({ role, latest: pending });
      return pending;
    },

    async close() {
      if (singleUse) {
        for (const [role, first] of shared) {
          const session = await first.catch(() => null);
          if (session) write(role, await signIn(role, session.account));
        }
      }
      if (!provider.remove) return;
      for (const { role, latest } of used) {
        const session = await latest.catch(() => null);
        if (!session?.provisioned) continue;
        await provider.remove({
          ...contextOf(role),
          account: session.account,
          session: session.signedIn,
        });
      }
    },
  };
}
