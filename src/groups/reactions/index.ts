/**
 * Public surface of the 007a reactions slice.
 *
 * WIRING STATUS (fast-lane build, owner-authorized 2026-10-03):
 *
 * TODO(006e wiring): `ReactionRow` + `getGroupItemReactionSnapshot` are the
 * friend-facing interactive reaction row and read for the member-wishlist
 * browsing surface (`/groups/[groupId]/members/[memberId]/wishlist`). That
 * page is built by the separate 006e track and is not on this base yet:
 * wire the row into the 006e item card there, zipping
 * `member_wishlist_snapshot` with `group_item_reaction_snapshot` by
 * `item_id` (never by row position; exclude 006e's authorized-empty
 * sentinel `item_id` null row), and pass a server action backed by
 * `setGroupItemReaction` that applies the authoritative returned summary.
 *
 * Owner wiring: /wishlist loads `getOwnItemReactionSummary` and joins the
 * aggregate-only rows by item id through the normal and reordered card
 * views. Missing read results are omitted, never fabricated as zero counts.
 * The owner summary has no mutation or reservation controls.
 */

export { ReactionRow } from "./reaction-row";
export { OwnerReactionSummaryRow } from "./owner-reaction-summary";
export {
  getGroupItemReactionSnapshot,
  getOwnItemReactionSummary,
  setGroupItemReaction,
} from "./reaction-write";
export {
  REACTION_KINDS,
  REACTION_LABELS,
  isReactionKind,
  totalReactionCount,
} from "./types";
export type { ReactionCounts, ReactionKind, ReactionSummaryRow } from "./types";
export type {
  OwnerReactionSummary,
  ReactionWriteOutcome,
} from "./reaction-write";
export type { ReactionWriteOutcome as ReactionWriteResult } from "./reaction-write";
