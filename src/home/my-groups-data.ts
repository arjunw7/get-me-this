import "server-only";

import { createSupabaseServerClient } from "@/src/supabase/server";

/**
 * Server-side home data access. The authenticated home consumes exactly ONE
 * database projection — public.my_groups_snapshot() — and never a base-table
 * query or any direct group/member read. The actor is always derived inside
 * the database function from auth.uid().
 *
 * Every failure mode — provider unavailability, an unexpected shape, a bad
 * id, an unknown mode — maps to the same `unavailable` outcome, which the
 * route renders as the designed error state. No failure message ever
 * carries group content. An empty array is a real result: the signed-in
 * user has no groups (the authorized-empty sentinel).
 */

export type MyGroupMode = "secret_draw" | "gift_everyone" | "wishlist_only";

export type MyGroupSummary = {
  readonly groupId: string;
  readonly groupName: string;
  readonly occasion: string;
  /** The group-zone wall clock exactly as projected (no viewer-zone shift). */
  readonly occasionAt: string;
  readonly timeZone: string;
  readonly location: string | null;
  readonly mode: MyGroupMode;
  readonly joinedMemberCount: number;
  readonly callerIsOrganizer: boolean;
};

export type MyGroupsResult =
  | { readonly status: "ready"; readonly groups: readonly MyGroupSummary[] }
  | { readonly status: "unavailable" };

export type SnapshotRow = {
  group_id: unknown;
  group_name: unknown;
  occasion: unknown;
  occasion_at: unknown;
  time_zone: unknown;
  location: unknown;
  mode: unknown;
  joined_member_count: unknown;
  caller_is_organizer: unknown;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MODES: readonly MyGroupMode[] = [
  "secret_draw",
  "gift_everyone",
  "wishlist_only",
];

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
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

function parseRow(row: SnapshotRow): MyGroupSummary | null {
  const groupId = text(row.group_id);
  const groupName = text(row.group_name);
  const occasion = text(row.occasion);
  const occasionAt = text(row.occasion_at);
  const timeZone = text(row.time_zone);
  const mode = text(row.mode) as MyGroupMode | null;
  const joinedMemberCount = normalizeCount(row.joined_member_count);
  if (
    groupId === null ||
    !UUID_PATTERN.test(groupId) ||
    groupName === null ||
    occasion === null ||
    occasionAt === null ||
    timeZone === null ||
    mode === null ||
    !MODES.includes(mode) ||
    joinedMemberCount === null ||
    typeof row.caller_is_organizer !== "boolean"
  ) {
    return null;
  }
  return {
    groupId,
    groupName,
    occasion,
    occasionAt,
    timeZone,
    location: nullableText(row.location),
    mode,
    joinedMemberCount,
    callerIsOrganizer: row.caller_is_organizer,
  };
}

/**
 * Parses the projection's rows under the strict shape contract. Null for
 * any unexpected shape; an empty array is the real authorized-empty
 * sentinel.
 */
export function parseMyGroupsSnapshot(
  data: readonly SnapshotRow[] | null,
): readonly MyGroupSummary[] | null {
  if (!Array.isArray(data)) return null;
  const groups: MyGroupSummary[] = [];
  for (const row of data) {
    const parsed = parseRow(row as SnapshotRow);
    if (parsed === null) return null;
    groups.push(parsed);
  }
  return groups;
}

/**
 * Loads the caller's groups through the single projection. `unavailable`
 * for every denial, provider failure, and unexpected shape.
 */
export async function loadMyGroups(): Promise<MyGroupsResult> {
  const client = await createSupabaseServerClient();
  if (!client) return { status: "unavailable" };

  const { data, error } = await client.rpc("my_groups_snapshot");
  if (error) return { status: "unavailable" };

  const groups = parseMyGroupsSnapshot(data as readonly SnapshotRow[] | null);
  if (groups === null) return { status: "unavailable" };
  return { status: "ready", groups };
}
