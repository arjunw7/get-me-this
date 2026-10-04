import "server-only";

import { createSupabaseServerClient } from "@/src/supabase/server";
import { getServerAnalytics } from "@/src/analytics/server";
import { requireCompleteProfile } from "@/src/profile/session";

/**
 * Gift-everyone checklist server data access (brief 008b). Every read and
 * write goes through the two reviewed SECURITY DEFINER projections; the
 * application never queries the checklist table, never queries profiles
 * directly, and never decides authorization itself — the database owns the
 * mode gating and the participation predicate, derived only from the
 * authenticated session.
 */

export type ChecklistRow = {
  recipientUserId: string | null;
  recipientDisplayName: string;
  recipientIsOrganizer: boolean | null;
  entryStatus: "todo" | "completed" | null;
  entryVersion: number | null;
  entryCompletedAt: string | null;
  participatingMemberCount: number | null;
  budgetAmountMinor: number | null;
  budgetCurrency: string | null;
  isSentinel: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isGroupIdFormat(groupId: string): boolean {
  return UUID_PATTERN.test(groupId);
}

/**
 * Loads the caller's own checklist. Null means the generic denial (unknown
 * group, outsider, ineligible membership, or a group whose stored mode is
 * not `gift_everyone`): the route renders the same not-found for every
 * denied state, with no distinguishing detail.
 */
export async function loadGiftChecklist(
  groupId: string,
): Promise<ChecklistRow[] | null> {
  if (!isGroupIdFormat(groupId)) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("gift_checklist_snapshot", {
    p_group_id: groupId,
  });
  if (error) return null;

  const rows = (data ?? []) as Array<{
    recipient_user_id: string | null;
    recipient_display_name: string | null;
    recipient_is_organizer: boolean | null;
    entry_status: string | null;
    entry_version: number | null;
    entry_completed_at: string | null;
    participating_member_count: number | null;
    budget_amount_minor: number | null;
    budget_currency: string | null;
  }>;

  return rows.map((row) => ({
    recipientUserId: row.recipient_user_id,
    recipientDisplayName: row.recipient_display_name ?? "Member",
    recipientIsOrganizer: row.recipient_is_organizer,
    entryStatus:
      row.entry_status === "todo" || row.entry_status === "completed"
        ? row.entry_status
        : null,
    entryVersion: row.entry_version,
    entryCompletedAt: row.entry_completed_at,
    participatingMemberCount: row.participating_member_count,
    budgetAmountMinor: row.budget_amount_minor,
    budgetCurrency: row.budget_currency,
    isSentinel: row.recipient_user_id === null,
  }));
}

export type StatusChangeOutcome =
  | {
      kind: "updated";
      version: number;
      action: "completed" | "reopened";
      checklistTotalBucket: "one_to_five" | "six_to_ten" | "eleven_plus";
    }
  | { kind: "conflict" }
  | { kind: "unavailable" };

function bucketFor(
  count: number | null,
): "one_to_five" | "six_to_ten" | "eleven_plus" {
  if (count !== null && count >= 11) return "eleven_plus";
  if (count !== null && count >= 6) return "six_to_ten";
  return "one_to_five";
}

/**
 * Compare-and-swap checklist status change through the reviewed definer
 * function. On `updated` — and only then — emits the single server event
 * `gift_checklist_progressed` with the closed property set. Conflicts and
 * denials emit nothing.
 */
export async function setChecklistEntryStatus(
  groupId: string,
  recipientId: string,
  expectedVersion: number | null,
  status: "todo" | "completed",
): Promise<StatusChangeOutcome> {
  await requireCompleteProfile();
  if (!isGroupIdFormat(groupId) || !isGroupIdFormat(recipientId)) {
    return { kind: "unavailable" };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { kind: "unavailable" };

  const { data, error } = await supabase.rpc(
    "set_gift_checklist_entry_status",
    {
      p_group_id: groupId,
      p_recipient_id: recipientId,
      p_expected_version: expectedVersion,
      p_status: status,
    },
  );
  if (error || !data || data.length === 0) return { kind: "unavailable" };

  const row = data[0] as { result: string; version: number | null };
  if (row.result === "updated") {
    const snapshot = await loadGiftChecklist(groupId);
    const count = snapshot?.[0]?.participatingMemberCount ?? null;
    const { userId } = await requireCompleteProfile();
    const analytics = await getServerAnalytics();
    await analytics.capture(
      "gift_checklist_progressed",
      {
        action: status === "completed" ? "completed" : "reopened",
        checklist_total_bucket: bucketFor(count),
      },
      { distinctId: userId, group: { id: groupId } },
    );
    return {
      kind: "updated",
      version: row.version ?? 1,
      action: status === "completed" ? "completed" : "reopened",
      checklistTotalBucket: bucketFor(count),
    };
  }
  if (row.result === "conflict") return { kind: "conflict" };
  return { kind: "unavailable" };
}
