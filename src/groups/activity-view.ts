import type { ActivityEntry, ActivityEntryKind } from "./activity-data";

/**
 * Pure presentation contracts for the group activity section (brief 007d).
 * No database, session, or environment access. The binding rules live
 * here in one place:
 *
 *   * Reservation entries are state-only for every viewer except the
 *     reserver: "A gift was reserved for Buni" — never "Charu reserved
 *     Buni's gift" unless the viewer IS Charu (self-labelling through
 *     `involvesViewer`, never through a display name).
 *   * Reservation wording never addresses the viewer as the recipient's
 *     owner: the owner reads "A gift was reserved for your wishlist"? No —
 *     the owner reads nothing at all (the projection's blind spot), so no
 *     owner-facing wording exists here.
 *   * No entry ever references invitation mechanics (issued, revoked,
 *     declined, reinvited), emails, tokens, counts, or aggregates.
 */

export type ActivityEntryView = {
  readonly key: string;
  readonly text: string;
  readonly kind: ActivityEntryKind;
  /** True only for the viewer's own reservation/self entries. */
  readonly involvesViewer: boolean;
};

/**
 * The brief's visible-entry count buckets: 0, 1-5, 6-20, 21+. Counted over
 * the viewer's visible entries only, so the bucket cannot reveal withheld
 * entries.
 */
export type ActivityCountBucket =
  "zero" | "one_to_five" | "six_to_twenty" | "twenty_one_plus";

export function activityCountBucket(count: number): ActivityCountBucket {
  if (count <= 0) return "zero";
  if (count <= 5) return "one_to_five";
  if (count <= 20) return "six_to_twenty";
  return "twenty_one_plus";
}

export type GroupActivityMode =
  "secret_draw" | "gift_everyone" | "wishlist_only";

/** The single analytics event this section's authorized render may emit. */
export type GroupActivityViewedEvent = {
  readonly name: "group_activity_viewed";
  readonly properties: {
    scope: "group";
    entry_count_bucket: ActivityCountBucket;
    gifting_mode: GroupActivityMode;
  };
};

/** Assembles the one authorized-render event from visible facts only. */
export function groupActivityViewedEvent(
  visibleCount: number,
  mode: GroupActivityMode,
): GroupActivityViewedEvent {
  return {
    name: "group_activity_viewed",
    properties: {
      scope: "group",
      entry_count_bucket: activityCountBucket(visibleCount),
      gifting_mode: mode,
    },
  };
}

const KIND_VERBS: Record<ActivityEntryKind, string> = {
  group_created: "created the group",
  invitation_accepted: "joined the group",
  member_left: "left the group",
  member_removed: "was removed from the group",
  organizer_transferred: "became the organizer",
  item_reserved: "was reserved",
  reservation_released: "was released",
  item_reacted: "reacted to",
};

const SELF_KIND_VERBS: Partial<Record<ActivityEntryKind, string>> = {
  item_reserved: "You reserved",
  reservation_released: "You released your reservation for",
  item_reacted: "You reacted to",
};

const KIND_ICONS: Record<ActivityEntryKind, string> = {
  group_created: "🎉",
  invitation_accepted: "👋",
  member_left: "🚪",
  member_removed: "🚪",
  organizer_transferred: "👑",
  item_reserved: "🎁",
  reservation_released: "↩️",
  item_reacted: "✨",
};

/**
 * Renders one entry for the viewer. Reservation entries are state-only
 * about others ("A gift was reserved for {owner}") and self-labelled for
 * the reserver ("You reserved {title} for {owner}"). Every other kind
 * names its actor (or the viewer themself through the self label).
 */
export function activityEntryText(entry: ActivityEntry): string {
  const { eventKind, involvesViewer } = entry;

  if (eventKind === "item_reserved" || eventKind === "reservation_released") {
    const target = entry.itemTitle ?? "a gift";
    const forOwner = entry.ownerDisplayName
      ? ` for ${entry.ownerDisplayName}`
      : "";
    if (involvesViewer) {
      const selfVerb = SELF_KIND_VERBS[eventKind];
      return `${selfVerb} ${target}${forOwner}`;
    }
    return `A gift ${KIND_VERBS[eventKind]}${forOwner}`;
  }

  if (eventKind === "item_reacted") {
    const target = entry.itemTitle ?? "an item";
    if (involvesViewer) return `${SELF_KIND_VERBS[eventKind]} ${target}`;
    const actor = entry.actorDisplayName ?? "A member";
    return `${actor} ${KIND_VERBS[eventKind]} ${target}`;
  }

  // Membership events: the actor acts (member_removed is actor-organizer,
  // subject-member — the subject is named, the actor is never shown as
  // blame).
  if (involvesViewer && eventKind !== "member_removed") {
    return `You ${KIND_VERBS[eventKind]}`;
  }
  if (eventKind === "member_removed") {
    return `${entry.subjectDisplayName ?? "A member"} ${KIND_VERBS[eventKind]}`;
  }
  const actor = entry.actorDisplayName ?? "A member";
  return `${actor} ${KIND_VERBS[eventKind]}`;
}

export function activityEntryIcon(entry: ActivityEntry): string {
  return KIND_ICONS[entry.eventKind];
}

/** Stable list keys: kind + timestamp + identity material already exposed. */
export function activityEntryKey(entry: ActivityEntry, index: number): string {
  return `${entry.eventKind}-${entry.occurredAt}-${index}`;
}
