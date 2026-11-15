// The admin API's staff and access endpoints (`/api/v3/admin/roles`, `invitations`, `admin_users`):
// the admin makes a role, invites a member into it and reads the invitation's acceptance link; the
// member accepts it with a password, which creates the account. No email is sent or read. The
// client is bound to a context that carries the admin's bearer token, except `accept`, which the
// invitation's token authorizes.

import type { APIRequestContext } from '@playwright/test';

export interface Created {
  memberId: string;
  roleId: string;
}

/** The sections whose lists the cases ask for, by the admin API path that lists them. */
export const SECTION_LISTS = {
  orders: 'api/v3/admin/orders',
  products: 'api/v3/admin/products',
  customers: 'api/v3/admin/customers',
  admin_users: 'api/v3/admin/admin_users',
  roles: 'api/v3/admin/roles',
} as const;
export type Section = keyof typeof SECTION_LISTS;

async function ok<T>(response: Awaited<ReturnType<APIRequestContext['get']>>, what: string) {
  if (!response.ok()) throw new Error(`Spree admin API: ${what} answered ${response.status()}.`);
  return (await response.json()) as T;
}

export class StaffApi {
  constructor(private readonly api: APIRequestContext) {}

  async createRole(name: string, permissions: readonly string[]): Promise<string> {
    const role = await ok<{ id: string }>(
      await this.api.post('api/v3/admin/roles', { data: { name, permissions } }),
      'creating a role',
    );
    return role.id;
  }

  /** Invite `email` into the role; the invitation's id and the token its acceptance needs. */
  async invite(email: string, roleId: string): Promise<{ id: string; token: string }> {
    const invitation = await ok<{ id: string }>(
      await this.api.post('api/v3/admin/invitations', { data: { email, role_id: roleId } }),
      'inviting a member',
    );
    const link = await ok<{ acceptance_url: string }>(
      await this.api.get(`api/v3/admin/invitations/${invitation.id}/acceptance_link`),
      "reading an invitation's acceptance link",
    );
    const token = new URL(link.acceptance_url, 'http://placeholder').searchParams.get('token');
    if (!token) throw new Error("Spree admin API: an invitation's acceptance link has no token.");
    return { id: invitation.id, token };
  }

  /** The member's id, from the list of staff by address; null when there is none. */
  async memberId(email: string): Promise<string | null> {
    const page = await ok<{ data: { id: string; email: string }[] }>(
      await this.api.get('api/v3/admin/admin_users', { params: { per_page: 100 } }),
      'listing the staff',
    );
    return page.data.find((member) => member.email === email)?.id ?? null;
  }

  /** Remove a member; the status, so a case can check a refusal and cleanup can accept a 404. */
  async removeMember(id: string): Promise<number> {
    return (await this.api.delete(`api/v3/admin/admin_users/${id}`)).status();
  }

  /** Remove a role; Spree refuses one a member still holds. */
  async removeRole(id: string): Promise<number> {
    return (await this.api.delete(`api/v3/admin/roles/${id}`)).status();
  }

  /** The status of a section's list for the session this client holds. */
  async listStatus(section: Section): Promise<number> {
    return (await this.api.get(SECTION_LISTS[section])).status();
  }
}

/**
 * Accept an invitation with the member's password and name, through a context without a session;
 * the new member's id.
 */
export async function acceptInvitation(
  anonymous: APIRequestContext,
  invitation: { id: string; token: string },
  member: { password: string; first: string; last: string },
): Promise<string> {
  const accepted = await ok<{ user: { id: string } }>(
    await anonymous.post(`api/v3/admin/auth/invitations/${invitation.id}/accept`, {
      params: { token: invitation.token },
      data: {
        password: member.password,
        password_confirmation: member.password,
        first_name: member.first,
        last_name: member.last,
      },
    }),
    'accepting an invitation',
  );
  return accepted.user.id;
}
