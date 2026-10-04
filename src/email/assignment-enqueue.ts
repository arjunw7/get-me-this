import "server-only";

/**
 * The 009a assignment-email enqueue contract (009b companion wiring).
 *
 * 008c is mid-merge: this module implements the brief-frozen contract
 * against the 009a outbox and MUST be verified against 008c's merged
 * functions once they land (they will be on main before this PR merges).
 * It is deliberately NOT wired into any draw path yet — the draw call site
 * lands with 008c's merge or a follow-up rebase.
 *
 * Privacy invariants (binding):
 * - Exactly one email per current valid giver of the current draw version,
 *   each carrying exactly what `my_assignment` lawfully shows that giver.
 * - A giver whose current assignment reads `is_valid = false` (the
 *   null-recipient departed state) is never sent a stale-recipient email —
 *   the Member-fallback email is only lawful for a VALID current
 *   assignment, so invalid rows are skipped entirely.
 * - Recipient-side silence is absolute: after a tombstone mode change away
 *   from `secret_draw`, the caller passes no readable assignments (the same
 *   current-version, current-generation read predicate as
 *   `my_assignment` returns zero), so nothing is enqueued or sent.
 * - A redraw enqueues under the NEW version's key only.
 */

import {
  assignmentIdempotencyKey,
  buildAssignmentPayload,
  enqueueEmail,
} from "./outbox";
import { abuseLimitsEnabled } from "@/src/rate-limit/window-limiter";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DrawAssignmentRow = {
  readonly groupId: string;
  readonly groupName: string;
  readonly occasionDate: string;
  readonly drawVersion: string | number;
  readonly giverId: string;
  /** null only when the assignment is VALID but the recipient name is unset. */
  readonly recipientDisplayName: string | null;
  /** 008c's validity column: invalid rows are never emailed. */
  readonly isValid: boolean;
};

export type AssignmentEnqueueOutcome = {
  readonly enqueued: number;
  readonly skippedInvalid: number;
  readonly quotaDeferred: number;
};

export async function enqueueAssignmentEmails(
  client: SupabaseClient,
  assignments: readonly DrawAssignmentRow[],
  options: { readonly perGroupHourlyMax?: number } = {},
): Promise<AssignmentEnqueueOutcome> {
  const perGroupHourlyMax = options.perGroupHourlyMax ?? 20;
  let enqueued = 0;
  let skippedInvalid = 0;
  let quotaDeferred = 0;

  for (const row of assignments) {
    // Validity gating: an is_valid = false assignment never produces an
    // email naming the stale recipient.
    if (!row.isValid) {
      skippedInvalid += 1;
      continue;
    }

    // The per-group enqueue budget (009b): bounds an enqueue storm under
    // the Resend free-tier quota; exceeding it fails closed for the rest
    // of that group's hour (the next draw replay re-enqueues idempotently).
    // Staged enablement: with the controls off (local/test), admission is
    // unconditional.
    let admitted = true;
    if (abuseLimitsEnabled()) {
      try {
        const { data } = await client.rpc("rate_limit_increment", {
          p_limit_key: `email_enqueue:g:${row.groupId}`,
          p_window_seconds: 3600,
          p_max: perGroupHourlyMax,
        });
        admitted = data === true;
      } catch {
        admitted = false;
      }
    }
    if (!admitted) {
      quotaDeferred += 1;
      continue;
    }

    const result = await enqueueEmail(client, {
      idempotencyKey: assignmentIdempotencyKey(
        row.groupId,
        row.drawVersion,
        row.giverId,
      ),
      templateKey: "assignment",
      recipientUserId: row.giverId,
      payload: buildAssignmentPayload({
        groupId: row.groupId,
        groupName: row.groupName,
        occasionDate: row.occasionDate,
        drawVersion: row.drawVersion,
        recipientDisplayName: row.recipientDisplayName,
      }),
    });
    if (result === "enqueued" || result === "already_pending") {
      enqueued += 1;
    }
  }
  return { enqueued, skippedInvalid, quotaDeferred };
}
