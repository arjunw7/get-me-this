import type { MemberWishlistSnapshot } from "./member-wishlist-data";

/**
 * Pure presentation and dispatch contracts for the member wishlist browse
 * route (brief 006e). No database, session, or environment access: these
 * are the truthful-state decisions, the analytics event assembly, and the
 * display helpers the server render and the tests share.
 */

export type MemberWishlistViewScope = "own" | "friend";

export type MemberWishlistState = "populated" | "empty";

export type MemberWishlistCountBucket =
  "zero" | "one_to_five" | "six_to_ten" | "eleven_plus";

export type MemberWishlistMode =
  "secret_draw" | "gift_everyone" | "wishlist_only";

/**
 * The single analytics event this route may emit, with its closed property
 * set (the brief's exact enums). No identifier, count, name, title, URL,
 * note, price, or currency is ever sent; the group context is not attached
 * for this event.
 */
export type MemberWishlistViewedEvent = {
  readonly name: "member_wishlist_viewed";
  readonly properties: {
    view_scope: MemberWishlistViewScope;
    wishlist_state: MemberWishlistState;
    item_count_bucket: MemberWishlistCountBucket;
    gifting_mode: MemberWishlistMode;
  };
};

/** The brief's item-count buckets: 0, 1-5, 6-10, 11+. */
export function itemCountBucket(count: number): MemberWishlistCountBucket {
  if (count <= 0) return "zero";
  if (count <= 5) return "one_to_five";
  if (count <= 10) return "six_to_ten";
  return "eleven_plus";
}

/** The route's dispatch decision for one authorized or denied request. */
export type MemberWishlistRouteDecision =
  // Every denial class: the route renders the generic not-found result and
  // emits nothing.
  | { readonly kind: "not-found" }
  // The authorized viewer IS the target: the route redirects to the owner
  // wishlist and renders no member-wishlist region. The event is still
  // emitted exactly once for this authorized render.
  | {
      readonly kind: "own";
      readonly event: MemberWishlistViewedEvent;
    }
  // The authorized viewer browses another joined member's wishlist.
  | {
      readonly kind: "friend";
      readonly memberDisplayName: string;
      readonly items: MemberWishlistSnapshot["items"];
      readonly event: MemberWishlistViewedEvent;
    };

/**
 * The route dispatch for one loaded snapshot and group mode. A null
 * snapshot is every denial class; the own case short-circuits to the
 * redirect decision; the friend case carries the rendered model plus the
 * single event. The event's `wishlist_state` and bucket derive only from
 * the snapshot's rows, never from separate queries.
 */
export function memberWishlistRouteDecision(
  snapshot: MemberWishlistSnapshot | null,
  viewerId: string,
  memberId: string,
  mode: MemberWishlistMode | null,
): MemberWishlistRouteDecision {
  if (snapshot === null || mode === null) return { kind: "not-found" };

  const event: MemberWishlistViewedEvent = {
    name: "member_wishlist_viewed",
    properties: {
      view_scope: viewerId === memberId ? "own" : "friend",
      wishlist_state: snapshot.items.length === 0 ? "empty" : "populated",
      item_count_bucket: itemCountBucket(snapshot.items.length),
      gifting_mode: mode,
    },
  };

  if (viewerId === memberId) {
    return { kind: "own", event };
  }
  return {
    kind: "friend",
    memberDisplayName: snapshot.memberDisplayName,
    items: snapshot.items,
    event,
  };
}

/** The V18 member-wishlist heading: "{Name}'s wishlist". */
export function memberWishlistHeading(memberDisplayName: string): string {
  return `${memberDisplayName}'s wishlist`;
}

/** The honest sharing statement under the member header. */
export const MEMBER_WISHLIST_SHARING_NOTE =
  "Wishlists are shared only with joined group members.";

/** The empty state's pinned copy — never an invitation to edit. */
export const MEMBER_WISHLIST_EMPTY_TEXT =
  "This member has not added anything to their wishlist yet.";
