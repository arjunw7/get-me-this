import "server-only";

/**
 * Typed server-side access to the 009a outbox. All database work happens in
 * the SECURITY DEFINER functions; the outbox table itself carries no client
 * privilege. The payload builders here mirror the database allowlist
 * exactly — a payload that the database would reject never leaves this
 * module, and nothing that is not a named template variable (token, email
 * address, assignment identity, wishlist content) can be built.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClaimedEmail } from "./worker";
import type { EmailOutboxStatus } from "./types";

export type EnqueueResult =
  | "enqueued"
  | "already_pending"
  | "already_claimed"
  | "already_sent"
  | "already_failed"
  | "rejected";

export async function enqueueEmail(
  client: SupabaseClient,
  args: {
    idempotencyKey: string;
    templateKey: "invitation" | "assignment" | "reminder";
    recipientUserId: string;
    payload: Record<string, string | null>;
  },
): Promise<EnqueueResult> {
  const { data, error } = await client.rpc("enqueue_email", {
    p_idempotency_key: args.idempotencyKey,
    p_template_key: args.templateKey,
    p_recipient_user_id: args.recipientUserId,
    p_payload: args.payload,
  });
  if (error) return "rejected";
  return (data as EnqueueResult) ?? "rejected";
}

export async function claimDueEmails(
  client: SupabaseClient,
  limit: number,
): Promise<ClaimedEmail[]> {
  const { data, error } = await client.rpc("claim_due_emails", {
    p_limit: limit,
  });
  if (error || !Array.isArray(data)) return [];
  return data.map((row) => {
    const record = row as {
      id: string;
      template_key: ClaimedEmail["template_key"];
      recipient_user_id: string;
      payload: Record<string, string | null>;
    };
    return {
      id: record.id,
      template_key: record.template_key,
      recipient_user_id: record.recipient_user_id,
      payload: record.payload ?? {},
    };
  });
}

export async function recordEmailResult(
  client: SupabaseClient,
  args: {
    id: string;
    outcome: "sent" | "retry" | "failed_permanent";
    providerMessageId: string | null;
    errorCategory:
      | "provider_error"
      | "rate_limited"
      | "invalid_payload"
      | "recipient_unavailable"
      | null;
  },
): Promise<"recorded" | "ignored"> {
  const { data, error } = await client.rpc("record_email_result", {
    p_id: args.id,
    p_outcome: args.outcome,
    p_provider_message_id: args.providerMessageId,
    p_error_category: args.errorCategory,
  });
  if (error) return "ignored";
  return (data as "recorded" | "ignored") ?? "ignored";
}

// --- Idempotency keys (exact brief contracts) ------------------------------

/** Invitation: the invitation row id composed with 006b's shareable_invitation_version. */
export function invitationIdempotencyKey(
  invitationId: string,
  shareableInvitationVersion: string | number,
): string {
  return `invitation:${invitationId}:${shareableInvitationVersion}`;
}

/** Assignment: exactly the 008c assignment identity. */
export function assignmentIdempotencyKey(
  groupId: string,
  drawVersion: string | number,
  giverId: string,
): string {
  return `assignment:${groupId}:${drawVersion}:${giverId}`;
}

/**
 * Reminder: the key includes the occasion date, so rescheduling the occasion
 * re-keys the reminder rather than replaying the prior one.
 */
export function reminderIdempotencyKey(
  groupId: string,
  reminderOffsetDays: number,
  occasionDate: string,
): string {
  return `reminder:${groupId}:${reminderOffsetDays}:${occasionDate}`;
}

// --- Payload builders (mirroring the database allowlists exactly) ----------

export type InvitationTemplateData = {
  groupId: string;
  groupName: string;
  occasionDate: string;
  hostDisplayName: string;
  budgetAmountMinor: string;
  budgetCurrency: string;
  giftingMode: string;
  joinedMemberCount: number;
  invitationId: string;
  invitationVersion: string | number;
};

export type AssignmentTemplateData = {
  groupId: string;
  groupName: string;
  occasionDate: string;
  drawVersion: string | number;
  recipientDisplayName: string | null;
};

export type ReminderTemplateData = {
  groupId: string;
  groupName: string;
  occasionDate: string;
  reminderOffsetDays: number;
};

export function buildInvitationPayload(
  data: InvitationTemplateData,
): Record<string, string> {
  return {
    budget_amount_minor: String(Number(data.budgetAmountMinor)),
    budget_currency: data.budgetCurrency,
    gifting_mode: data.giftingMode,
    group_id: data.groupId,
    group_name: data.groupName,
    host_display_name: data.hostDisplayName,
    invitation_id: data.invitationId,
    invitation_version: String(data.invitationVersion),
    joined_member_count: String(data.joinedMemberCount),
    occasion_date: data.occasionDate,
  };
}

export function buildAssignmentPayload(
  data: AssignmentTemplateData,
): Record<string, string | null> {
  return {
    draw_version: String(data.drawVersion),
    group_id: data.groupId,
    group_name: data.groupName,
    occasion_date: data.occasionDate,
    recipient_display_name: data.recipientDisplayName,
  };
}

export function buildReminderPayload(
  data: ReminderTemplateData,
): Record<string, string> {
  return {
    group_id: data.groupId,
    group_name: data.groupName,
    occasion_date: data.occasionDate,
    reminder_offset_days: String(data.reminderOffsetDays),
  };
}

export type { EmailOutboxStatus };
