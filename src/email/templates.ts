import { brandedShell, bounded, escapeHtml, assertBounded } from "./render";
import type {
  AssignmentEmailPayload,
  InvitationEmailPayload,
  ReminderEmailPayload,
  RenderedEmail,
} from "./types";
import { REMINDER_OFFSET_DAYS } from "./types";

/**
 * The three 009a templates. Every template obeys the product's privacy
 * boundary as a hard invariant:
 *
 * - Invitation: exactly the 006c seven-field limited preview plus the CTA
 *   to the canonical raw-token route. The raw token appears only in the
 *   rendered body's link construction at send time — never persisted,
 *   never logged, never echoed anywhere else, with no-referrer link
 *   semantics and no tracking pixels.
 * - Assignment (givers only): exactly what my_assignment returns to that
 *   giver; a null recipient renders the established generic Member
 *   fallback. Nothing ever tells a recipient they are being gifted with.
 * - Reminder: group name, occasion date, and a group-room link only — no
 *   per-member progress, reservation, checklist, or assignment content.
 *
 * Every template renders both HTML and plain-text alternatives and uses
 * render-time escaping for user-supplied strings.
 */

function moneyLine(amountMinor: string, currency: string): string | null {
  if (
    !/^\d+$/.test(amountMinor) ||
    !["INR", "USD", "GBP", "EUR"].includes(currency)
  ) {
    return null;
  }
  return `${amountMinor} minor units (${currency})`;
}

export function renderInvitationEmail(
  payload: InvitationEmailPayload,
  rawToken: string,
  appBaseUrl: string,
): RenderedEmail {
  const group = bounded(
    escapeHtml(assertBounded(payload.group_name, "group_name")),
  );
  const host = bounded(
    escapeHtml(assertBounded(payload.host_display_name, "host_display_name")),
  );
  const inviteUrl = `${appBaseUrl.replace(/\/$/, "")}/invite/${rawToken}`;

  const bodyHtml = [
    `<p style="margin:0 0 12px;">${host} invited you to their wishlist group <strong>${group}</strong>.</p>`,
    `<p style="margin:0 0 12px;">Occasion date: ${escapeHtml(bounded(payload.occasion_date))}</p>`,
    `<p style="margin:0 0 12px;">Budget: ${escapeHtml(
      bounded(
        moneyLine(payload.budget_amount_minor, payload.budget_currency) ??
          "not set",
      ),
    )}</p>`,
    `<p style="margin:0 0 12px;">Gifting mode: ${escapeHtml(bounded(payload.gifting_mode))}</p>`,
    `<p style="margin:0 0 12px;">Joined members so far: ${escapeHtml(bounded(payload.joined_member_count))}</p>`,
  ].join("");

  const text = [
    `${payload.host_display_name} invited you to their wishlist group ${payload.group_name}.`,
    `Occasion date: ${payload.occasion_date}`,
    `Budget: ${moneyLine(payload.budget_amount_minor, payload.budget_currency) ?? "not set"}`,
    `Gifting mode: ${payload.gifting_mode}`,
    `Joined members so far: ${payload.joined_member_count}`,
    `Open your invitation: ${inviteUrl}`,
  ].join("\n");

  return {
    subject: `${payload.host_display_name} invited you to ${payload.group_name}`,
    html: brandedShell({
      heading: "You're invited",
      bodyHtml,
      ctaLabel: "Open your invitation",
      ctaUrl: inviteUrl,
    }),
    text,
  };
}

export function renderAssignmentEmail(
  payload: AssignmentEmailPayload,
  appBaseUrl: string,
  /** 008d's assignment view route, when merged; the group room otherwise. */
  assignmentPath: string | null,
): RenderedEmail {
  const recipient =
    payload.recipient_display_name === null ||
    payload.recipient_display_name === ""
      ? "Member"
      : escapeHtml(
          bounded(
            assertBounded(
              payload.recipient_display_name,
              "recipient_display_name",
            ),
          ),
        );
  const group = escapeHtml(
    bounded(assertBounded(payload.group_name, "group_name")),
  );
  const targetPath = assignmentPath ?? `/groups/${payload.group_id}`;
  const linkUrl = `${appBaseUrl.replace(/\/$/, "")}${targetPath}`;

  const bodyHtml = [
    `<p style="margin:0 0 12px;">Your draw for <strong>${group}</strong> is in: you're giving to <strong>${recipient}</strong>.</p>`,
    `<p style="margin:0 0 12px;">Occasion date: ${escapeHtml(bounded(payload.occasion_date))}</p>`,
  ].join("");

  const text = [
    `Your draw for ${payload.group_name} is in: you're giving to ${payload.recipient_display_name === null || payload.recipient_display_name === "" ? "Member" : payload.recipient_display_name}.`,
    `Occasion date: ${payload.occasion_date}`,
    `Open your assignment: ${linkUrl}`,
  ].join("\n");

  return {
    subject: `Your gift assignment for ${payload.group_name}`,
    html: brandedShell({
      heading: "Your assignment is in",
      bodyHtml,
      ctaLabel: "Open your assignment",
      ctaUrl: linkUrl,
    }),
    text,
  };
}

export function renderReminderEmail(
  payload: ReminderEmailPayload,
  appBaseUrl: string,
): RenderedEmail {
  const group = escapeHtml(
    bounded(assertBounded(payload.group_name, "group_name")),
  );
  const roomUrl = `${appBaseUrl.replace(/\/$/, "")}/groups/${payload.group_id}`;

  const bodyHtml = [
    `<p style="margin:0 0 12px;"><strong>${group}</strong> is coming up.</p>`,
    `<p style="margin:0 0 12px;">Occasion date: ${escapeHtml(bounded(payload.occasion_date))}</p>`,
    `<p style="margin:0 0 12px;">Update your wishlist so your people can take the hint.</p>`,
  ].join("");

  const text = [
    `${payload.group_name} is coming up.`,
    `Occasion date: ${payload.occasion_date}`,
    `Update your wishlist: ${roomUrl}`,
  ].join("\n");

  return {
    subject: `${payload.group_name} is coming up`,
    html: brandedShell({
      heading: "Your group's occasion is near",
      bodyHtml,
      ctaLabel: "Update my wishlist",
      ctaUrl: roomUrl,
    }),
    text,
  };
}

export { REMINDER_OFFSET_DAYS };
