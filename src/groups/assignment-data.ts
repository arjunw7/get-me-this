import "server-only";

import { createSupabaseServerClient } from "@/src/supabase/server";

/**
 * Assignment-surface server data access (brief 008d). Every read goes
 * through the reviewed SECURITY DEFINER projections — `my_assignment`,
 * `my_assignment_view_state`, and `group_draw_state` — and never a
 * base-table query or any other member's assignment. The actor is always
 * derived inside the database from auth.uid().
 *
 * The giver surface renders exactly what `my_assignment` returns: the
 * established generic "Member" fallback, the neutral `is_valid = false`
 * state with null recipient columns, and zero rows rendered identically for
 * every denial class. Version numbers, generations, tombstone internals,
 * and audit metadata are never surfaced to the giver.
 *
 * Marking viewed happens server-side, once per new valid assignment
 * version, through the idempotent `mark_assignment_viewed` upsert: the
 * marker is read first, and the mark fires only when no marker exists for
 * the current version yet.
 */

export type GiverAssignment = {
  readonly drawVersion: number;
  readonly recipientId: string | null;
  readonly recipientDisplayName: string | null;
  readonly isValid: boolean;
  /** The caller's own viewed marker for this version, when already seen. */
  readonly viewedAt: string | null;
};

export type DrawState = {
  readonly drawVersion: number;
  readonly drawnAt: string | null;
  readonly participantCount: number;
  readonly rosterInSync: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isGroupIdFormat(groupId: string): boolean {
  return UUID_PATTERN.test(groupId);
}

function asIsoStamp(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Loads the caller's own current assignment with its viewed marker. Zero
 * rows — from every denial class, without distinction — maps to null.
 */
export async function loadMyAssignment(
  groupId: string,
): Promise<GiverAssignment | null> {
  if (!isGroupIdFormat(groupId)) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("my_assignment", {
    p_group_id: groupId,
  });
  if (error) return null;
  const row = (data ?? [])[0] as
    | {
        draw_version: unknown;
        recipient_id: unknown;
        recipient_display_name: unknown;
        is_valid: unknown;
      }
    | undefined;
  if (!row || typeof row.is_valid !== "boolean") return null;

  const drawVersion =
    typeof row.draw_version === "number" ? row.draw_version : null;
  if (drawVersion === null) return null;

  const { data: viewRows, error: viewError } = await supabase.rpc(
    "my_assignment_view_state",
    { p_group_id: groupId },
  );
  const viewedAt =
    !viewError && (viewRows ?? []).length > 0
      ? asIsoStamp((viewRows as Array<{ viewed_at: unknown }>)[0]?.viewed_at)
      : null;

  // Marking viewed fires exactly once per version: the idempotent upsert is
  // invoked only when no marker exists yet. The marker write is a server
  // action on the giver's own row and never blocks or shapes the render
  // beyond the seen state.
  if (viewedAt === null) {
    const { error: markError } = await supabase.rpc("mark_assignment_viewed", {
      p_group_id: groupId,
    });
    if (!markError) {
      // Reflect the committed marker without a second round-trip: the
      // upsert's clock_timestamp is now.
      return {
        drawVersion,
        recipientId:
          typeof row.recipient_id === "string" ? row.recipient_id : null,
        recipientDisplayName:
          typeof row.recipient_display_name === "string"
            ? row.recipient_display_name
            : null,
        isValid: row.is_valid,
        viewedAt: null,
      };
    }
  }

  return {
    drawVersion,
    recipientId: typeof row.recipient_id === "string" ? row.recipient_id : null,
    recipientDisplayName:
      typeof row.recipient_display_name === "string"
        ? row.recipient_display_name
        : null,
    isValid: row.is_valid,
    viewedAt,
  };
}

/**
 * Loads the organizer's draw existence metadata (exactly the
 * `group_draw_state` result). Zero rows — including every denial class and
 * the no-draw-yet state — maps to null. Never any giver→recipient pair.
 */
export async function loadDrawState(
  groupId: string,
): Promise<DrawState | null> {
  if (!isGroupIdFormat(groupId)) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("group_draw_state", {
    p_group_id: groupId,
  });
  if (error) return null;
  const row = (data ?? [])[0] as
    | {
        draw_version: unknown;
        drawn_at: unknown;
        participant_count: unknown;
        roster_in_sync: unknown;
      }
    | undefined;
  if (!row || typeof row.draw_version !== "number") return null;

  return {
    drawVersion: row.draw_version,
    drawnAt: asIsoStamp(row.drawn_at),
    participantCount:
      typeof row.participant_count === "number" ? row.participant_count : 0,
    rosterInSync: row.roster_in_sync === true,
  };
}
