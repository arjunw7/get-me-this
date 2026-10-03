import "server-only";

import { createSupabaseServerClient } from "@/src/supabase/server";

/**
 * Server-side group-room data access (brief 006d). The room consumes exactly
 * ONE database projection — public.group_room_snapshot(uuid) — and never a
 * base-table query, a direct profile/member/invitation read, a service-role
 * credential, or any wishlist or gifting surface. The actor is always
 * derived inside the database function from auth.uid(); the caller id passed
 * here is used only to validate that the snapshot contains the caller's own
 * joined row.
 *
 * Every failure mode — provider unavailability, an empty result, an
 * unexpected shape, contradictory group values, a missing caller row,
 * duplicate member ids, a pending organizer, a count mismatch — maps to the
 * same null, which the route renders as the generic not-found result. No
 * failure message ever carries group or roster content.
 */

export type GroupRoomMode = "secret_draw" | "gift_everyone" | "wishlist_only";

export type GroupRoomMember = {
  readonly userId: string;
  readonly displayName: string;
  readonly state: "joined" | "invited";
  readonly isOrganizer: boolean;
};

export type GroupRoomSnapshot = {
  readonly groupId: string;
  readonly organizerId: string;
  readonly name: string;
  readonly occasion: string;
  /** The group-zone wall clock exactly as projected (no viewer-zone shift). */
  readonly occasionAt: string;
  readonly timeZone: string;
  readonly location: string | null;
  readonly description: string | null;
  readonly budgetAmountMinor: string | null;
  readonly budgetCurrency: string | null;
  readonly mode: GroupRoomMode;
  readonly joinedMemberCount: number;
  readonly members: readonly GroupRoomMember[];
};

export type SnapshotRow = {
  group_id: unknown;
  organizer_id: unknown;
  group_name: unknown;
  occasion: unknown;
  occasion_at: unknown;
  time_zone: unknown;
  location: unknown;
  description: unknown;
  budget_amount_minor: unknown;
  budget_currency: unknown;
  mode: unknown;
  group_status: unknown;
  joined_member_count: unknown;
  member_user_id: unknown;
  member_display_name: unknown;
  member_state: unknown;
  member_is_organizer: unknown;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isOptionalText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

const MODES: readonly GroupRoomMode[] = [
  "secret_draw",
  "gift_everyone",
  "wishlist_only",
];

/**
 * Validates and combines the projection's rows into the room model. Null on
 * every inconsistency — the route renders the same not-found result for a
 * denial and for a shape it cannot trust.
 */
export function parseGroupRoomSnapshot(
  rows: readonly SnapshotRow[] | null,
  callerId: string,
): GroupRoomSnapshot | null {
  if (!rows || rows.length === 0) return null;

  const first = rows[0];
  if (!first) return null;

  // The repeated group columns must be identical across every row.
  const groupKeys = [
    "group_id",
    "organizer_id",
    "group_name",
    "occasion",
    "occasion_at",
    "time_zone",
    "location",
    "description",
    "budget_amount_minor",
    "budget_currency",
    "mode",
    "group_status",
    "joined_member_count",
  ] as const;
  for (const row of rows) {
    for (const key of groupKeys) {
      if (row[key] !== first[key]) return null;
    }
  }

  if (
    !isUuid(first.group_id) ||
    !isUuid(first.organizer_id) ||
    !isText(first.group_name) ||
    !isText(first.occasion) ||
    !isText(first.occasion_at) ||
    !isText(first.time_zone) ||
    !isOptionalText(first.location) ||
    !isOptionalText(first.description) ||
    !isText(first.mode) ||
    !MODES.includes(first.mode as GroupRoomMode) ||
    first.group_status !== "active"
  ) {
    return null;
  }

  const budgetPair = parseBudgetPair(
    first.budget_amount_minor,
    first.budget_currency,
  );
  if (!budgetPair) return null;

  // PostgREST delivers int8 columns as strings; accept the exact integer in
  // both transports.
  const joinedMemberCount = normalizeCount(first.joined_member_count);
  if (joinedMemberCount === null) {
    return null;
  }

  const members: GroupRoomMember[] = [];
  const seenUserIds = new Set<string>();
  let callerRows = 0;
  let joinedRows = 0;

  for (const row of rows) {
    if (
      !isUuid(row.member_user_id) ||
      !isText(row.member_display_name) ||
      (row.member_state !== "joined" && row.member_state !== "invited") ||
      typeof row.member_is_organizer !== "boolean"
    ) {
      return null;
    }
    if (seenUserIds.has(row.member_user_id)) return null;
    seenUserIds.add(row.member_user_id);

    // The database invariant makes the organizer's row joined; a pending
    // organizer row is a shape this application refuses to render.
    if (row.member_is_organizer && row.member_state !== "joined") return null;

    if (row.member_state === "joined") joinedRows += 1;
    if (row.member_user_id === callerId) {
      if (row.member_state !== "joined") return null;
      callerRows += 1;
    }

    members.push({
      userId: row.member_user_id,
      displayName: row.member_display_name,
      state: row.member_state,
      isOrganizer: row.member_is_organizer,
    });
  }

  // The caller's own joined row must be present exactly once, the organizer's
  // joined row must be present, and the projected count must match the rows.
  if (callerRows !== 1) return null;
  if (!seenUserIds.has(first.organizer_id)) return null;
  if (joinedRows !== joinedMemberCount) return null;

  return {
    groupId: first.group_id,
    organizerId: first.organizer_id,
    name: first.group_name,
    occasion: first.occasion,
    occasionAt: first.occasion_at,
    timeZone: first.time_zone,
    location: first.location,
    description: first.description,
    budgetAmountMinor:
      budgetPair.amountMinor === "" ? null : budgetPair.amountMinor,
    budgetCurrency: budgetPair.currency === "" ? null : budgetPair.currency,
    mode: first.mode as GroupRoomMode,
    joinedMemberCount,
    members,
  };
}

function parseBudgetPair(
  amountMinor: unknown,
  currency: unknown,
): { amountMinor: string; currency: string } | null {
  if (amountMinor === null && currency === null) {
    return { amountMinor: "", currency: "" };
  }
  // PostgREST renders bigint as a JSON number when exact and as a string
  // beyond Number precision; both carry the canonical integer.
  const amountText =
    typeof amountMinor === "number" && Number.isInteger(amountMinor)
      ? amountMinor.toString()
      : amountMinor;
  if (
    typeof amountText === "string" &&
    /^\d+$/.test(amountText) &&
    typeof currency === "string" &&
    /^[A-Z]{3}$/.test(currency)
  ) {
    return { amountMinor: amountText, currency };
  }
  return null;
}

function normalizeCount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return null;
}

/**
 * Loads the room snapshot for the caller through the single projection.
 * Null for every denial, unknown group, and unavailable provider.
 */
export async function loadGroupRoomSnapshot(
  groupId: string,
  callerId: string,
): Promise<GroupRoomSnapshot | null> {
  const client = await createSupabaseServerClient();
  if (!client) return null;

  const { data, error } = await client.rpc("group_room_snapshot", {
    p_group_id: groupId,
  });
  if (error) return null;

  return parseGroupRoomSnapshot(
    data as readonly SnapshotRow[] | null,
    callerId,
  );
}
