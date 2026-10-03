"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getServerAnalytics } from "@/src/analytics/server";
import { enqueueAssignmentEmails } from "@/src/email/assignment-enqueue";
import type { DrawAssignmentRow } from "@/src/email/assignment-enqueue";
import {
  createEmailServiceClient,
  getEmailServiceConfig,
} from "@/src/email/service";
import { requireCompleteProfile } from "@/src/profile/session";
import { createSupabaseServerClient } from "@/src/supabase/server";
import { isGroupIdFormat } from "@/src/groups/assignment-data";

/**
 * The organizer's confirmed draw/redraw server action (brief 008d). The
 * only application call site of `run_secret_draw`.
 *
 * The compare-and-swap expected version passes through untouched: the
 * organizer confirmed against a specific version, so a `stale` result — a
 * concurrent draw or tombstone beat them — returns to the refreshed room
 * state and never retries (a retry could re-randomize blindly).
 *
 * Immediately after a committed draw, the action performs the 009a
 * assignment-email enqueue through the pinned contract helper: exactly one
 * email per current valid giver under the exact 008c identity key, invalid
 * rows skipped, the per-group budget honoured, tombstone silence, and
 * exactly-once per draw version. The enqueue read is the narrowly reviewed
 * organizer-gated server-side projection `draw_assignments_for_email`; its
 * rows are consumed here and never rendered, logged, or returned to any
 * client surface.
 *
 * Analytics is the closed catalog: exactly one `name_draw_completed` per
 * committed draw, and nothing on any failure.
 */

export type DrawActionOutcome =
  | { kind: "drawn" }
  | { kind: "stale" }
  | { kind: "insufficient_participants" }
  | { kind: "unavailable" };

function participantCountBucket(count: number): "2-3" | "4-6" | "7-10" | "11+" {
  if (count >= 11) return "11+";
  if (count >= 7) return "7-10";
  if (count >= 4) return "4-6";
  return "2-3";
}

export async function runDrawAction(formData: FormData): Promise<void> {
  const groupId = String(formData.get("groupId") ?? "");
  const expectedRaw = String(formData.get("expectedDrawVersion") ?? "");

  const caller = await requireCompleteProfile();
  if (!isGroupIdFormat(groupId)) {
    redirect(`/groups/${groupId}?draw=unavailable`);
  }

  const expectedDrawVersion = /^\d+$/.test(expectedRaw)
    ? Number(expectedRaw)
    : null;

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    redirect(`/groups/${groupId}?draw=unavailable`);
  }

  const { data, error } = await supabase.rpc("run_secret_draw", {
    p_group_id: groupId,
    p_expected_draw_version: expectedDrawVersion,
  });
  if (error) {
    redirect(`/groups/${groupId}?draw=unavailable`);
  }

  const result = (data as Array<{ result: string; draw_version: number }>)[0]
    ?.result;
  if (result !== "drawn") {
    revalidatePath(`/groups/${groupId}`);
    redirect(
      `/groups/${groupId}?draw=${
        result === "stale"
          ? "stale"
          : result === "insufficient_participants"
            ? "insufficient"
            : "unavailable"
      }`,
    );
  }

  const drawVersion = (
    data as Array<{ result: string; draw_version: number }>
  )[0].draw_version;

  // The 009a enqueue: the first call site of the pinned contract helper.
  // Rows the projection cannot read (a tombstone, wrong mode, archival) mean
  // nothing is enqueued — tombstone silence by construction.
  const { data: emailRows, error: emailError } = await supabase.rpc(
    "draw_assignments_for_email",
    { p_group_id: groupId },
  );

  if (!emailError && Array.isArray(emailRows)) {
    const assignments: DrawAssignmentRow[] = (
      emailRows as Array<{
        group_name: unknown;
        occasion_date: unknown;
        draw_version: unknown;
        giver_id: unknown;
        recipient_display_name: unknown;
        is_valid: unknown;
      }>
    )
      .filter(
        (row) =>
          typeof row.giver_id === "string" && typeof row.is_valid === "boolean",
      )
      .map((row) => ({
        groupId,
        groupName:
          typeof row.group_name === "string" ? row.group_name : "Your group",
        occasionDate:
          typeof row.occasion_date === "string"
            ? row.occasion_date
            : String(row.occasion_date ?? ""),
        drawVersion:
          typeof row.draw_version === "number" ? row.draw_version : drawVersion,
        giverId: row.giver_id as string,
        recipientDisplayName:
          typeof row.recipient_display_name === "string"
            ? row.recipient_display_name
            : null,
        isValid: row.is_valid as boolean,
      }));

    // The outbox enqueue is a service_role capability by design (009a): the
    // narrowly scoped server-only service client is the established pattern
    // (006c landing guard, 007d abuse gate). Without the deployment's
    // service configuration the enqueue fails safe to silence — the CAS
    // contract means a legitimate draw is never silently re-randomized; the
    // next confirmed redraw re-enqueues idempotently under its own version.
    const emailServiceConfig = getEmailServiceConfig();
    if (emailServiceConfig) {
      await enqueueAssignmentEmails(
        createEmailServiceClient(emailServiceConfig),
        assignments,
      );
    }
  }

  // Exactly one emission per committed draw, with the closed property set.
  // The participant count is the committed version's assignment count; a
  // failure here must never fail the draw, so the capture is bounded.
  try {
    await getServerAnalytics().capture(
      "name_draw_completed",
      {
        participant_count_bucket: participantCountBucket(
          Array.isArray(emailRows) ? emailRows.length : 0,
        ),
        is_redraw: expectedDrawVersion !== null,
      },
      { distinctId: caller.userId },
    );
  } catch {
    // Analytics failures never fail a committed draw.
  }

  revalidatePath(`/groups/${groupId}`);
  redirect(`/groups/${groupId}?draw=drawn`);
}
