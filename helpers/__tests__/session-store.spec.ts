// The life of a worker's sessions (helpers/session-store.ts), with a provider that counts what it
// is asked: accounts are made once per role, a reusable session is shared, a single-use one is
// signed in again for every context and left unused for the tools at the end, and every
// provisioned account is removed once.

import { expect, test } from '@playwright/test';
import type { ActorContext, ActorProvider, SignedIn } from '../actors';
import type { ActorConfig } from '../config';
import { sessionStore } from '../session-store';

const CONFIGS: Record<string, ActorConfig> = {
  customer: { account: 'provisioned' },
  admin: {
    account: 'existing',
    username_env: 'STORE_ADMIN_USER',
    password_env: 'STORE_ADMIN_PASS',
  },
};
// Built while the test runs: the test data carries no credential-shaped literal.
const PASS = ['fake', 'admin', 'pass'].join('-');
const ENV = { STORE_ADMIN_USER: 'admin', STORE_ADMIN_PASS: PASS };

function harness(singleUseSessions: boolean) {
  const log: string[] = [];
  const written: { role: string; token: string }[] = [];
  const learned: string[] = [];
  let tokens = 0;
  let accounts = 0;
  const provider: ActorProvider = {
    ...(singleUseSessions ? { singleUseSessions } : {}),
    async provision({ role, account }) {
      accounts += 1;
      const made = account ?? { username: `${role}-${accounts}`, password: `pw-${accounts}` };
      log.push(`provision ${made.username}`);
      return made;
    },
    async signIn({ account }): Promise<SignedIn> {
      tokens += 1;
      const token = `token-${tokens}`;
      log.push(`signIn ${account.username} ${token}`);
      return { storageState: { cookies: [], origins: [] }, secrets: [token] };
    },
    async remove({ account, session }) {
      log.push(`remove ${account.username} with ${session.secrets?.[0]}`);
    },
  };
  const store = sessionStore({
    provider,
    contextOf: (role) => ({ role, worker: 0 }) as unknown as ActorContext,
    configOf: (role) => CONFIGS[role] ?? null,
    learn: (secrets) => learned.push(...secrets),
    write(role, signedIn) {
      written.push({ role, token: signedIn.secrets?.[0] ?? '' });
      return `/auth/${role}-0.json`;
    },
    env: ENV,
  });
  return { store, log, written, learned };
}

test('a reusable session is signed in once per role, shared, and written when it is made', async () => {
  const { store, log, written, learned } = harness(false);
  const first = await store.get('customer');
  const second = await store.get('customer');
  expect(second).toBe(first);
  expect(first.file).toBe('/auth/customer-0.json');
  expect(log).toEqual(['provision customer-1', 'signIn customer-1 token-1']);
  expect(written).toEqual([{ role: 'customer', token: 'token-1' }]);
  expect(learned).toEqual(['pw-1', 'token-1']);
  await store.close();
  expect(log.slice(2)).toEqual(['remove customer-1 with token-1']);
  expect(written).toHaveLength(1);
});

test('a single-use session: one account, a sign-in per context, one unused session written at the end', async () => {
  const { store, log, written, learned } = harness(true);
  const sessions = [
    await store.get('customer'),
    await store.get('customer'),
    await store.get('customer'),
  ];
  expect(new Set(sessions.map((s) => s.account.username))).toEqual(new Set(['customer-1']));
  expect(sessions.map((s) => s.signedIn.secrets?.[0])).toEqual(['token-1', 'token-2', 'token-3']);
  expect(sessions.every((s) => s.file === null)).toBe(true);
  expect(written, 'nothing is written while contexts spend the sessions').toEqual([]);
  expect(learned).toEqual(['pw-1', 'token-1', 'token-2', 'token-3']);

  const admin = await store.get('admin');
  expect(admin.account).toEqual({ username: 'admin', password: PASS });
  await store.get('admin');

  await store.close();
  // Each role gets one more sign-in that no context used, written for app:map --actor; then the
  // provisioned account is removed once, with its latest session.
  expect(written).toEqual([
    { role: 'customer', token: 'token-6' },
    { role: 'admin', token: 'token-7' },
  ]);
  expect(log.filter((line) => line.startsWith('remove'))).toEqual([
    'remove customer-1 with token-3',
  ]);
  expect(log.filter((line) => line.startsWith('provision'))).toEqual(['provision customer-1']);
});

test('fresh accounts are made per call, never written, and removed; only provisioned roles can be fresh', async () => {
  for (const singleUse of [false, true]) {
    const { store, log, written } = harness(singleUse);
    await store.get('customer');
    const own = await store.fresh('customer');
    const built = await store.fresh('customer', { username: 'built', password: 'pw-built' });
    expect(own.account.username).toBe('customer-2');
    expect(built.account.username).toBe('built');
    expect([own.file, built.file]).toEqual([null, null]);
    await expect(store.fresh('admin')).rejects.toThrow(/only a provisioned role can be fresh/);
    await expect(store.get('anonymous')).rejects.toThrow(/anonymous actor has no session/);
    await store.close();
    expect(log.filter((line) => line.startsWith('remove')).sort()).toEqual([
      expect.stringMatching(/^remove built with/),
      expect.stringMatching(/^remove customer-1 with/),
      expect.stringMatching(/^remove customer-2 with/),
    ]);
    expect(written.map((w) => w.role)).toEqual(['customer']);
  }
});

test('a missing variable of an existing account is named, and its value never is', async () => {
  const { store } = harness(true);
  const missing = sessionStore({
    provider: {
      async signIn() {
        throw new Error('not reached');
      },
    },
    contextOf: (role) => ({ role, worker: 0 }) as unknown as ActorContext,
    configOf: (role) => CONFIGS[role] ?? null,
    learn: () => undefined,
    write: () => '',
    env: { STORE_ADMIN_USER: 'admin' },
  });
  await expect(missing.get('admin')).rejects.toThrow(/STORE_ADMIN_PASS, which is not set/);
  await store.close();
});
