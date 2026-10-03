import "server-only";

import { createSupabaseServerClient } from "@/src/supabase/server";

/**
 * Server-side organizer membership-control data access (brief 006f). The
 * organizer surface consumes exactly four reviewed database projections —
 * public.group_admin_members, public.group_admin_audit,
 * public.group_admin_version, and public.group_admin_live_invitations — and
 * never a base-table query, a direct profile/member/invitation/audit read, a
 * service-role credential, or any wishlist or gifting surface. The actor is
 * always derived inside the database functions from auth.uid(); every
 * projection returns zero rows for a non-organizer.
 *
 * Every failure mode — provider unavailability, an unexpected shape, a
 * roster without exactly one joined organizer row, a missing caller row,
 * duplicate member ids, a former-state organizer row, or a malformed
 * version — maps to the same null, which the route renders as the room's
 * existing safe-error result. No failure message ever carries roster or
 * audit content.
 */

export type MemberAdminStatus =
  "invited" | "joined" | "declined" | "left" | "removed";

export type AdminRosterMember = {
  readonly userId: string;
  readonly displayName: string;
  readonly status: MemberAdminStatus;
  readonly participating: boolean;
  readonly joinedAt: string | null;
  readonly leftAt: string | null;
};

export type AdminAuditEventType =
  | "member_removed"
  | "organizer_transferred"
  | "member_reinvited"
  | "invitation_revoked";

export type AdminAuditEntry = {
  readonly eventType: AdminAuditEventType;
  readonly createdAt: string;
  readonly subjectUserId: string | null;
  readonly subjectDisplayLabel: string | null;
  readonly membershipGeneration: number | null;
};

export type AdminLiveInvitation = {
  readonly targetUserId: string;
  readonly invitationId: string;
  readonly expiresAt: string;
};

export type MemberAdminState = {
  readonly groupId: string;
  /** The durable compare-and-swap version (exact integer string). */
  readonly version: string;
  readonly members: readonly AdminRosterMember[];
  readonly audit: readonly AdminAuditEntry[];
  readonly liveInvitations: readonly AdminLiveInvitation[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUSES: readonly MemberAdminStatus[] = [
  "invited",
  "joined",
  "declined",
  "left",
  "removed",
];

const AUDIT_EVENT_TYPES: readonly AdminAuditEventType[] = [
  "member_removed",
  "organizer_transferred",
  "member_reinvited",
  "invitation_revoked",
];

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isOptionalTimestamp(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length > 0);
}

function normalizeVersion(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value.toString();
  }
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  return null;
}

function normalizeGeneration(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return null;
}

type RosterRow = {
  user_id: unknown;
  display_name: unknown;
  status: unknown;
  participating: unknown;
  joined_at: unknown;
  left_at: unknown;
};

/**
 * Validates the administrative roster. Fails closed unless every membership
 * row appears exactly once with a known status, exactly one row is the
 * group's organizer, that row is currently joined, and the caller is that
 * organizer.
 */
export function parseGroupAdminMembers(
  rows: readonly RosterRow[] | null,
  organizerId: string,
  callerId: string,
): AdminRosterMember[] | null {
  if (!rows || rows.length === 0) return null;
  if (organizerId !== callerId) return null;

  const members: AdminRosterMember[] = [];
  const seen = new Set<string>();
  let organizerRows = 0;

  for (const row of rows) {
    if (
      !isUuid(row.user_id) ||
      !isText(row.display_name) ||
      typeof row.status !== "string" ||
      !STATUSES.includes(row.status as MemberAdminStatus) ||
      typeof row.participating !== "boolean" ||
      !isOptionalTimestamp(row.joined_at) ||
      !isOptionalTimestamp(row.left_at)
    ) {
      return null;
    }
    if (seen.has(row.user_id)) return null;
    seen.add(row.user_id);

    if (row.user_id === organizerId) {
      // A former-state organizer row or a pending organizer row is a shape
      // this application refuses to render.
      if (row.status !== "joined") return null;
      organizerRows += 1;
    }

    members.push({
      userId: row.user_id,
      displayName: row.display_name,
      status: row.status as MemberAdminStatus,
      participating: row.participating,
      joinedAt: row.joined_at,
      leftAt: row.left_at,
    });
  }

  if (organizerRows !== 1) return null;
  if (!seen.has(organizerId)) return null;

  return members;
}

type AuditRow = {
  event_type: unknown;
  created_at: unknown;
  subject_user_id: unknown;
  subject_display_label: unknown;
  membership_generation: unknown;
};

/**
 * Validates the bounded audit projection's rows. The database restricts the
 * event vocabulary and the ordering; the parser refuses any row outside the
 * pinned member-control vocabulary rather than rendering it.
 */
export function parseGroupAdminAudit(
  rows: readonly AuditRow[] | null,
): AdminAuditEntry[] | null {
  if (rows === null) return null;

  const entries: AdminAuditEntry[] = [];
  for (const row of rows) {
    if (
      typeof row.event_type !== "string" ||
      !AUDIT_EVENT_TYPES.includes(row.event_type as AdminAuditEventType) ||
      !isText(row.created_at) ||
      !(row.subject_user_id === null || isUuid(row.subject_user_id)) ||
      !(row.subject_display_label === null || isText(row.subject_display_label))
    ) {
      return null;
    }
    const generation = normalizeGeneration(row.membership_generation);
    if (row.membership_generation !== null && generation === null) {
      return null;
    }
    entries.push({
      eventType: row.event_type as AdminAuditEventType,
      createdAt: row.created_at,
      subjectUserId: row.subject_user_id,
      subjectDisplayLabel: row.subject_display_label,
      membershipGeneration: generation,
    });
  }
  return entries;
}

type LiveInvitationRow = {
  target_user_id: unknown;
  invitation_id: unknown;
  expires_at: unknown;
};

/**
 * Validates the live targeted-invitation read: at most one live invitation
 * per invited member, invitation ids only, never token material.
 */
export function parseGroupAdminLiveInvitations(
  rows: readonly LiveInvitationRow[] | null,
): AdminLiveInvitation[] | null {
  if (rows === null) return null;

  const invitations: AdminLiveInvitation[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (
      !isUuid(row.target_user_id) ||
      !isUuid(row.invitation_id) ||
      !isText(row.expires_at)
    ) {
      return null;
    }
    if (seen.has(row.target_user_id)) return null;
    seen.add(row.target_user_id);
    invitations.push({
      targetUserId: row.target_user_id,
      invitationId: row.invitation_id,
      expiresAt: row.expires_at,
    });
  }
  return invitations;
}

/**
 * Loads the complete organizer admin state through the four reviewed
 * projections. Null for every denial (the caller is not the current joined
 * organizer), unknown group, unavailable provider, and any shape this
 * application refuses to render.
 */
export async function loadMemberAdminState(
  groupId: string,
  organizerId: string,
  callerId: string,
): Promise<MemberAdminState | null> {
  if (organizerId !== callerId) return null;

  const client = await createSupabaseServerClient();
  if (!client) return null;

  const [membersResult, auditResult, versionResult, invitationsResult] =
    await Promise.all([
      client.rpc("group_admin_members", { p_group_id: groupId }),
      client.rpc("group_admin_audit", { p_group_id: groupId }),
      client.rpc("group_admin_version", { p_group_id: groupId }),
      client.rpc("group_admin_live_invitations", { p_group_id: groupId }),
    ]);

  if (
    membersResult.error ||
    auditResult.error ||
    versionResult.error ||
    invitationsResult.error
  ) {
    return null;
  }

  const members = parseGroupAdminMembers(
    membersResult.data as readonly RosterRow[] | null,
    organizerId,
    callerId,
  );
  if (!members) return null;

  const audit = parseGroupAdminAudit(
    auditResult.data as readonly AuditRow[] | null,
  );
  if (audit === null) return null;

  const versionRow = (
    versionResult.data as readonly { member_admin_version: unknown }[] | null
  )?.[0];
  const version = versionRow
    ? normalizeVersion(versionRow.member_admin_version)
    : null;
  if (!version) return null;

  const liveInvitations = parseGroupAdminLiveInvitations(
    invitationsResult.data as readonly LiveInvitationRow[] | null,
  );
  if (liveInvitations === null) return null;

  return { groupId, version, members, audit, liveInvitations };
}
