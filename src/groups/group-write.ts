import "server-only";

import { createSupabaseServerClient } from "@/src/supabase/server";

import type { CanonicalPayloadV1 } from "./canonical";

/**
 * Server-side group data access (brief 006b). Every call goes through the
 * 006a/006b public database API — never a base-table query, never a
 * privileged admin credential. The actor is always derived from the
 * authenticated session inside the database functions via auth.uid().
 *
 * Result mapping is closed and typed; unknown rows map to retry. No result
 * ever carries invitation data: creation returns only the stable group id.
 */

export type CreateGroupOutcome =
  | { kind: "created"; groupId: string; createdNow: boolean }
  | { kind: "conflict" }
  | { kind: "unavailable" }
  | { kind: "retry" };

type CreateGroupRpcRow = {
  result: unknown;
  group_id: unknown;
  created_now: unknown;
};

export async function createGroupWithReceipt(
  requestKey: string,
  payload: CanonicalPayloadV1,
): Promise<CreateGroupOutcome> {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "unavailable" };

  const { data, error } = await client.rpc("create_group_v1", {
    p_request_key: requestKey,
    p_payload: payload,
  });
  if (error) return { kind: "retry" };

  const rows = data as CreateGroupRpcRow[] | null;
  if (!rows || rows.length !== 1) return { kind: "retry" };
  const row = rows[0];

  if (
    (row.result === "created" || row.result === "replayed") &&
    typeof row.group_id === "string" &&
    typeof row.created_now === "boolean"
  ) {
    return {
      kind: "created",
      groupId: row.group_id,
      createdNow: row.created_now,
    };
  }
  if (row.result === "idempotency-conflict") return { kind: "conflict" };
  return row.result === "unavailable"
    ? { kind: "unavailable" }
    : { kind: "retry" };
}

export type OrganizerInvitationState = {
  readonly version: string;
  readonly state: "never_issued" | "active" | "issued_expired" | "revoked";
  readonly expiresAt: string | null;
};

type StateRpcRow = {
  invitation_version: unknown;
  state: unknown;
  expires_at: unknown;
};

function isInvitationState(
  value: unknown,
): value is OrganizerInvitationState["state"] {
  return (
    value === "never_issued" ||
    value === "active" ||
    value === "issued_expired" ||
    value === "revoked"
  );
}

/**
 * The organizer-only shareable-invitation projection. Empty (null) for every
 * non-organizer, outsider, or unauthenticated caller — no enumeration.
 */
export async function loadOrganizerInvitationState(
  groupId: string,
): Promise<OrganizerInvitationState | null> {
  const client = await createSupabaseServerClient();
  if (!client) return null;

  const { data, error } = await client.rpc("group_shareable_invitation_state", {
    p_group_id: groupId,
  });
  if (error) return null;

  const rows = data as StateRpcRow[] | null;
  const row = rows?.[0];
  if (!row || !isInvitationState(row.state)) return null;
  return {
    version:
      typeof row.invitation_version === "string"
        ? row.invitation_version
        : String(row.invitation_version),
    state: row.state,
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
  };
}

export type IssueLinkOutcome =
  | {
      kind: "issued";
      token: string;
      version: string;
      expiresAt: string;
    }
  | { kind: "stale" }
  | { kind: "unavailable" }
  | { kind: "retry" };
type IssueRpcRow = {
  invitation_version: unknown;
  token: unknown;
  expires_at: unknown;
};

/**
 * The explicit generic compare-and-swap issuance. The raw token is returned
 * only to this initiating call — never logged, cached, or persisted here.
 */
export async function issueGroupInviteLink(
  groupId: string,
  expectedVersion: string,
): Promise<IssueLinkOutcome> {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "unavailable" };

  const expected = /^\d+$/.test(expectedVersion)
    ? BigInt(expectedVersion)
    : undefined;
  if (expected === undefined) return { kind: "unavailable" };

  const { data, error } = await client.rpc("issue_group_invitation", {
    p_group_id: groupId,
    // The database drives bigint; pass an exact integer-safe string form.
    p_expected_invitation_version: Number(expected),
  });
  if (error) {
    return error.code === "PT409" ? { kind: "stale" } : { kind: "retry" };
  }

  const rows = data as IssueRpcRow[] | null;
  const row = rows?.[0];
  if (
    row &&
    typeof row.token === "string" &&
    row.token.length > 0 &&
    typeof row.expires_at === "string"
  ) {
    return {
      kind: "issued",
      token: row.token,
      version:
        typeof row.invitation_version === "string"
          ? row.invitation_version
          : String(row.invitation_version),
      expiresAt: row.expires_at,
    };
  }
  return rows && rows.length === 0
    ? { kind: "unavailable" }
    : { kind: "retry" };
}

type GroupDetailRow = { name: unknown };

/**
 * The joined-member group detail (006a projection), narrowed to the display
 * name for the created screen. Empty for every non-joined caller; the created
 * page additionally requires the organizer-only invitation state, so a joined
 * non-organizer still receives a not-found result.
 */
export async function loadJoinedGroupName(
  groupId: string,
): Promise<string | null> {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data, error } = await client.rpc("group_detail", {
    p_group_id: groupId,
  });
  if (error) return null;
  const row = (data as GroupDetailRow[] | null)?.[0];
  return typeof row?.name === "string" && row.name.length > 0 ? row.name : null;
}
