import type {
  AdminAuditEntry,
  AdminAuditEventType,
  AdminLiveInvitation,
  AdminRosterMember,
} from "./member-admin-data";

/**
 * Pure presentation logic for the organizer membership tools (brief 006f).
 * No database, session, or environment access: these are the exact-label,
 * action-availability, and audit-copy decisions the server render and the
 * tests share.

 * The per-member action set is the brief's exact table: never two live
 * actions for the same member, never an action on the organizer's own row,
 * never a reinvite while a live invitation exists, never a revoke without
 * one.
 */

export type OrganizerToolAction =
  "remove" | "make-organizer" | "revoke-invite" | "invite-again";

/**
 * The actions a roster row offers, in display order, per the brief's exact
 * table: a joined member offers Remove from group and Make organizer; an
 * invited member with a live invitation offers Revoke invite; an invited
 * member without one — and every declined, left, or removed member — offers
 * Invite again. The organizer's own row offers nothing.
 */
export function memberAdminActions(
  member: Pick<AdminRosterMember, "userId" | "status">,
  organizerId: string,
  liveInvitation: Pick<AdminLiveInvitation, "targetUserId"> | undefined,
): readonly OrganizerToolAction[] {
  if (member.userId === organizerId) return [];
  if (liveInvitation && liveInvitation.targetUserId === member.userId) {
    return ["revoke-invite"];
  }
  switch (member.status) {
    case "joined":
      return ["remove", "make-organizer"];
    case "invited":
      return ["invite-again"];
    case "declined":
    case "left":
    case "removed":
      return ["invite-again"];
  }
}

/**
 * The exact roster status labels. The caller's own row combines "You" with
 * the base label; the organizer's row combines "Organizer" with it.
 */
export function adminStatusLabel(
  member: Pick<AdminRosterMember, "userId" | "status">,
  organizerId: string,
): string {
  const base =
    member.status === "joined"
      ? "Joined"
      : member.status.charAt(0).toUpperCase() + member.status.slice(1);
  const marks = [member.userId === organizerId ? "Organizer" : null].filter(
    (label): label is string => label !== null,
  );
  if (marks.length > 0) return marks.join(" · ");
  return base;
}

const AUDIT_SENTENCES: Record<AdminAuditEventType, string> = {
  member_removed: "was removed",
  organizer_transferred: "became the organizer",
  member_reinvited: "was re-invited",
  invitation_revoked: "invitation revoked",
}; /**
 * One pinned sentence per audit event. A named subject reads "Name was
 * removed"; a row without a subject (invitation_revoked) reads "An
 * invitation was revoked" — never a guessed name.
 */
export function adminAuditText(entry: AdminAuditEntry): string {
  if (entry.subjectDisplayLabel === null) {
    return "An invitation was revoked";
  }
  return `${entry.subjectDisplayLabel} ${AUDIT_SENTENCES[entry.eventType]}`;
}

/**
 * The designed empty state for the activity feed: an honest "nothing has
 * happened yet" line, never a blank region.
 */
export const ADMIN_AUDIT_EMPTY_TEXT =
  "No member activity yet. Removals, transfers, and re-invitations will show up here.";

/**
 * The one-time invitation link for the 006b-style reveal (Copy / WhatsApp /
 * copy-failure), built only from the token the reinvite action returned to
 * this page's component state. Same production link shape as the 006b
 * created screen: the opaque token route, never a name slug.
 */
export function targetedInviteLink(
  token: string,
  origin: string | null,
): string {
  const base = origin ?? "";
  return `${base}/invite/${token}`;
}
