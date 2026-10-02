/**
 * Shared email types (009a). The outbox carries template variables only;
 * the allowlists below mirror the database's private.email_payload_is_allowed
 * exactly. A token, address, assignment identity, or wishlist content that
 * is not a named template variable is rejected on both sides.
 */

export type EmailTemplateKey = "invitation" | "assignment" | "reminder";

export type EmailOutboxStatus =
  "pending" | "claimed" | "sent" | "failed_permanent";

/** The 009a invitation payload: exactly the 006c seven-field preview plus the invitation reference. Never the token. */
export type InvitationEmailPayload = {
  group_id: string;
  group_name: string;
  occasion_date: string;
  host_display_name: string;
  budget_amount_minor: string;
  budget_currency: string;
  gifting_mode: string;
  joined_member_count: string;
  invitation_id: string;
  invitation_version: string;
};

/** The 009a assignment payload: exactly what my_assignment lawfully shows one giver. */
export type AssignmentEmailPayload = {
  group_id: string;
  group_name: string;
  occasion_date: string;
  draw_version: string;
  /** null renders the established generic Member fallback. */
  recipient_display_name: string | null;
};

/** The 009a reminder payload: group name, occasion date, and the scheduled offset only. */
export type ReminderEmailPayload = {
  group_id: string;
  group_name: string;
  occasion_date: string;
  reminder_offset_days: string;
};

/**
 * The v1 reminder schedule pinned by 009a's implementation plan: one
 * reminder, exactly seven days before the occasion date. The offset is a
 * component of the idempotency key, so a rescheduled occasion date re-keys
 * the reminder rather than replaying or suppressing the prior one.
 */
export const REMINDER_OFFSET_DAYS = 7;

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};
