/**
 * The group activity read model (brief 007d): a thin, typed loader over the
 * one-statement `public.group_activity` projection. Every per-viewer
 * privacy filter lives inside the projection; this module never receives
 * unfiltered rows and never drops rows client-side. Null for every denial
 * class and unavailable provider — the projection returns zero rows for
 * every denial, which this module surfaces as an empty list.
 */
import { createSupabaseServerClient } from "@/src/supabase/server";

export type ActivityEntryKind =
  | "group_created"
  | "invitation_accepted"
  | "member_left"
  | "member_removed"
  | "organizer_transferred"
  | "item_reserved"
  | "reservation_released"
  | "item_reacted";

export type ActivityEntry = {
  readonly eventKind: ActivityEntryKind;
  readonly occurredAt: string;
  readonly actorDisplayName: string | null;
  readonly subjectDisplayName: string | null;
  readonly itemId: string | null;
  readonly itemTitle: string | null;
  readonly ownerDisplayName: string | null;
  readonly involvesViewer: boolean;
};

/** The projection's closed kind set; anything else is a contract violation. */
const EVENT_KINDS: readonly ActivityEntryKind[] = [
  "group_created",
  "invitation_accepted",
  "member_left",
  "member_removed",
  "organizer_transferred",
  "item_reserved",
  "reservation_released",
  "item_reacted",
];

export type ActivityRow = {
  event_kind: unknown;
  occurred_at: unknown;
  actor_display_name: unknown;
  subject_display_name: unknown;
  item_id: unknown;
  item_title: unknown;
  owner_display_name: unknown;
  involves_viewer: unknown;
};

function isActivityEntryKind(value: unknown): value is ActivityEntryKind {
  return EVENT_KINDS.includes(value as ActivityEntryKind);
}

function isOptionalText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/**
 * Parses the projection's rows. Returns null when any row violates the
 * declared shape (wrong kind, null mandatory field) — a malformed response
 * renders as a denial, never as a partially trusted list.
 */
export function parseGroupActivity(
  rows: readonly ActivityRow[] | null,
): ActivityEntry[] | null {
  if (!Array.isArray(rows)) return null;
  const entries: ActivityEntry[] = [];
  for (const row of rows) {
    const { event_kind, occurred_at, involves_viewer } = row;
    if (
      !isActivityEntryKind(event_kind) ||
      typeof occurred_at !== "string" ||
      typeof involves_viewer !== "boolean"
    ) {
      return null;
    }
    if (
      !isOptionalText(row.actor_display_name) ||
      !isOptionalText(row.subject_display_name) ||
      !isOptionalText(row.item_title) ||
      !isOptionalText(row.owner_display_name)
    ) {
      return null;
    }
    const itemId = row.item_id;
    if (itemId !== null && typeof itemId !== "string") return null;
    entries.push({
      eventKind: event_kind,
      occurredAt: occurred_at,
      actorDisplayName: row.actor_display_name,
      subjectDisplayName: row.subject_display_name,
      itemId,
      itemTitle: row.item_title,
      ownerDisplayName: row.owner_display_name,
      involvesViewer: involves_viewer,
    });
  }
  return entries;
}

/**
 * Loads the viewer's authorized activity page for the group through the
 * single projection. The default limit of 20 and the closed kind set are
 * the projection's own contract; this call never widens either.
 */
export async function loadGroupActivity(
  groupId: string,
): Promise<ActivityEntry[]> {
  const client = await createSupabaseServerClient();
  if (!client) return [];

  const { data, error } = await client.rpc("group_activity", {
    p_group_id: groupId,
  });
  if (error) return [];

  return parseGroupActivity(data as readonly ActivityRow[] | null) ?? [];
}
