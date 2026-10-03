import "server-only";

import { createSupabaseServerClient } from "@/src/supabase/server";

/**
 * Server-side organizer membership-control mutations (brief 006f). Every
 * call goes through the reviewed compare-and-swap database functions — never
 * a base-table write, never a privileged admin credential. The actor is
 * always derived from the authenticated session inside the database
 * functions via auth.uid(); a non-organizer caller gets an empty result,
 * which maps to unavailable with no enumeration.
 *
 * Result mapping is closed and typed; unknown rows map to retry. No result
 * ever carries a log, cookie, or analytics event: the reinvite token is
 * returned only to the initiating call, like the 006b issuance.
 */

export type MemberAdminMutationOutcome =
  | { kind: "committed"; version: string }
  | { kind: "stale" }
  | { kind: "unavailable" }
  | { kind: "retry" };

export type ReinviteOutcome =
  | {
      kind: "committed";
      version: string;
      token: string;
      expiresAt: string;
    }
  | { kind: "stale" }
  | { kind: "unavailable" }
  | { kind: "retry" };

type VersionedRpcRow = { member_admin_version: unknown };

type ReinviteRpcRow = {
  token: unknown;
  expires_at: unknown;
};

function normalizeVersion(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value.toString();
  }
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  return null;
}

async function runVersionedMutation(
  fn: string,
  args: Record<string, unknown>,
): Promise<MemberAdminMutationOutcome> {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "unavailable" };

  const { data, error } = await client.rpc(fn, args);
  if (error) {
    return error.code === "PT409" ? { kind: "stale" } : { kind: "retry" };
  }

  const rows = data as readonly VersionedRpcRow[] | null;
  const row = rows?.[0];
  if (!row)
    return rows && rows.length === 0
      ? { kind: "unavailable" }
      : { kind: "retry" };
  const version = normalizeVersion(row.member_admin_version);
  return version ? { kind: "committed", version } : { kind: "retry" };
}

/** Compare-and-swap removal of a joined member. */
export async function removeGroupMember(
  groupId: string,
  memberId: string,
  expectedVersion: string,
): Promise<MemberAdminMutationOutcome> {
  return runVersionedMutation("remove_group_member", {
    p_group_id: groupId,
    p_target_user_id: memberId,
    p_expected_member_admin_version: Number(expectedVersion),
  });
}

/** Compare-and-swap organizer transfer to a joined member. */
export async function transferGroupOrganizer(
  groupId: string,
  memberId: string,
  expectedVersion: string,
): Promise<MemberAdminMutationOutcome> {
  return runVersionedMutation("transfer_group_organizer", {
    p_group_id: groupId,
    p_target_user_id: memberId,
    p_expected_member_admin_version: Number(expectedVersion),
  });
}

/** Compare-and-swap revocation of a member's one live invitation. */
export async function revokeTargetedInvitation(
  groupId: string,
  invitationId: string,
  expectedVersion: string,
): Promise<MemberAdminMutationOutcome> {
  return runVersionedMutation("revoke_group_invitation", {
    p_group_id: groupId,
    p_invitation_id: invitationId,
    p_expected_member_admin_version: Number(expectedVersion),
  });
}

/**
 * Compare-and-swap reinvitation of a declined/left/removed member. The raw
 * token is returned only to this initiating call — never logged, cached, or
 * persisted here.
 */
export async function reinviteGroupMember(
  groupId: string,
  memberId: string,
  expectedVersion: string,
): Promise<ReinviteOutcome> {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "unavailable" };

  // Reinvitation IS the targeted issue: the reviewed CAS
  // issue_group_invitation overload covers declined/left/removed targets,
  // invited targets without a live invitation, and fresh invitations. It
  // returns the raw token and expiry; it does not return the version, so
  // the committed version is read back through the organizer-only
  // projection immediately after the commit.
  const { data, error } = await client.rpc("issue_group_invitation", {
    p_group_id: groupId,
    p_target_user_id: memberId,
    p_expected_member_admin_version: Number(expectedVersion),
  });
  if (error) {
    return error.code === "PT409" ? { kind: "stale" } : { kind: "retry" };
  }

  const rows = data as readonly ReinviteRpcRow[] | null;
  const row = rows?.[0];
  if (!row) {
    return rows && rows.length === 0
      ? { kind: "unavailable" }
      : { kind: "retry" };
  }
  if (
    typeof row.token !== "string" ||
    row.token.length === 0 ||
    typeof row.expires_at !== "string"
  ) {
    return { kind: "retry" };
  }

  const versionResult = await client.rpc("group_admin_version", {
    p_group_id: groupId,
  });
  const versionRows = versionResult.data as readonly VersionedRpcRow[] | null;
  const versionRow = versionRows?.[0];
  const version = versionRow
    ? normalizeVersion(versionRow.member_admin_version)
    : null;
  if (!version) return { kind: "retry" };
  return {
    kind: "committed",
    version,
    token: row.token,
    expiresAt: row.expires_at,
  };
}
