// The Spree Commerce admin pack's `test`: the core fixtures with Spree's way of creating and
// signing staff in, and one fixture per role.
//
// Signing in goes through the admin API, as the dashboard's own form does: the refresh cookie it
// sets is the session the dashboard opens with. Spree rotates that cookie on its first use and
// refuses it afterwards, so the sessions are single-use and the core signs in again for each
// context (helpers/session-store.ts). The `admin` actor is an existing account that
// `npm run spree:up` makes from the variables qa-config names.
//
// Staff are invited, not registered: to provision a member the provider signs the admin in on a
// request context of its own, makes a role with the actor's permissions
// (builders/staff-builder.ts), invites the member into it and accepts the invitation with a
// generated password. `remove` deletes the member, then the role; a member or role a case already
// removed answers 404, which is fine.

import { request } from '@playwright/test';
import { existingAccount, type Account, type ActorProvider } from '../../helpers/actors';
import { actorConfig, type QaRuntime } from '../../helpers/config';
import { rememberSecret } from '../../helpers/run-secrets';
import { createTest, expect, type Actor } from '../../fixtures';
import { AuthApi, REFRESH_COOKIE } from './api/auth-api';
import { StaffApi, acceptInvitation } from './api/staff-api';
import { ROLE_PERMISSIONS, aStaffMember, roleName, staffName } from './builders/staff-builder';

/** The admin's account, which provisions and removes the staff. */
function adminAccount(qa: QaRuntime): Account {
  const config = actorConfig(qa, 'admin');
  if (config?.account !== 'existing') throw new Error('The spree pack needs an existing admin.');
  return existingAccount(config, 'admin');
}

/** Run `work` with the admin's API on a context of its own, signed in and disposed afterwards. */
async function asAdmin<T>(qa: QaRuntime, work: (staff: StaffApi) => Promise<T>): Promise<T> {
  const baseURL = `${qa.baseUrl}/`;
  const signing = await request.newContext({ baseURL });
  try {
    const { token } = await new AuthApi(signing).login(adminAccount(qa));
    rememberSecret(token);
    const admin = await request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    try {
      return await work(new StaffApi(admin));
    } finally {
      await admin.dispose();
    }
  } finally {
    await signing.dispose();
  }
}

/** The ids `provision` keeps in `Account.id`: the member's, then the role's. */
const packIds = (memberId: string, roleId: string) => `${memberId} ${roleId}`;
const unpackIds = (id = '') => {
  const [memberId = '', roleId = ''] = id.split(' ');
  return { memberId, roleId };
};

export const provider: ActorProvider = {
  singleUseSessions: true,

  async provision({ qa, role, worker, account: built }) {
    const permissions = ROLE_PERMISSIONS[role];
    if (!permissions) throw new Error(`The spree pack has no permissions for the role "${role}".`);
    const account = built ?? aStaffMember(role, worker);
    const { roleId, invitation } = await asAdmin(qa, async (staff) => {
      const created = await staff.createRole(roleName(account), permissions);
      return { roleId: created, invitation: await staff.invite(account.username, created) };
    });
    const accepting = await request.newContext({ baseURL: `${qa.baseUrl}/` });
    try {
      const memberId = await acceptInvitation(accepting, invitation, {
        password: account.password,
        ...staffName(account),
      });
      return { ...account, id: packIds(memberId, roleId) };
    } finally {
      await accepting.dispose();
    }
  },

  async signIn({ api, qa, account }) {
    const { token, refresh } = await new AuthApi(api).login(account);
    return {
      storageState: {
        cookies: [
          {
            name: REFRESH_COOKIE,
            value: refresh.value,
            domain: new URL(qa.baseUrl).hostname,
            path: refresh.path,
            expires: refresh.expires,
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      },
      apiHeaders: { Authorization: `Bearer ${token}` },
      secrets: [token, refresh.value],
    };
  },

  async remove({ qa, account }) {
    const { memberId, roleId } = unpackIds(account.id);
    await asAdmin(qa, async (staff) => {
      for (const [what, removed] of [
        ['member', memberId && (await staff.removeMember(memberId))],
        ['role', roleId && (await staff.removeRole(roleId))],
      ] as const) {
        if (removed && removed !== 204 && removed !== 404) {
          throw new Error(`Removing the ${what} of ${account.username} answered ${removed}.`);
        }
      }
    });
  },
};

/** The ids `provision` gave a member, for a case that removes the member or the role itself. */
export function provisionedIds(account: Account | null): { memberId: string; roleId: string } {
  if (!account?.id) throw new Error('The actor has no provisioned account.');
  return unpackIds(account.id);
}

export const test = createTest(provider).extend<{
  admin: Actor;
  ordersReader: Actor;
  catalogEditor: Actor;
}>({
  admin: async ({ actor }, use) => use(await actor('admin')),
  ordersReader: async ({ actor }, use) => use(await actor('orders-reader')),
  catalogEditor: async ({ actor }, use) => use(await actor('catalog-editor')),
});

export { expect, type Actor };
