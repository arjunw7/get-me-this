import { loadGroupCopiedItemIds } from "@/src/groups/copy/copied-items-read";
import { CopyToWishlistButton } from "@/src/groups/copy/copy-button";
import { loadOwnCopiedItemIds } from "@/src/groups/copy/copy-read";
import { loadGroupMemberVibes } from "@/src/groups/member-vibes-data";
import { WishlistShellHeader } from "@/src/wishlist/wishlist-shell-header";
import { getGroupItemReactionSnapshot } from "@/src/groups/reactions/reaction-write";
import { MemberItemReactions } from "@/src/groups/member-item-reactions";
import { loadGiftingItemStates } from "@/src/groups/gifting-items-data";
import { GiftingReserveControl } from "@/src/groups/gifting-reserve-control";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AnalyticsIdentity } from "@/src/auth/analytics-identity";
import { getServerAnalytics } from "@/src/analytics/server";
import { requireCompleteProfile } from "@/src/profile/session";
import { createSupabaseServerClient } from "@/src/supabase/server";
import { loadMemberWishlistSnapshot } from "@/src/groups/member-wishlist-data";
import {
  memberWishlistRouteDecision,
  type MemberWishlistMode,
} from "@/src/groups/member-wishlist-view";
import { MemberWishlistScreen } from "@/src/groups/member-wishlist-screen";

export const metadata: Metadata = {
  title: "Get Me This | Member wishlist",
  description: "A shared wishlist inside your group.",
};
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type GroupDetailRow = {
  name: unknown;
  mode: unknown;
  status: unknown;
};

/**
 * The joined-member group detail narrowed to the fields this route needs:
 * the display name for the back link, the stored gifting mode for the
 * analytics event, and the lifecycle status. Read through the reviewed 006a
 * `group_detail` projection, which repeats the joined-caller check for this
 * exact group; null for every denial or unavailable provider.
 */
async function loadJoinedGroupFacts(
  groupId: string,
): Promise<{ name: string; mode: MemberWishlistMode } | null> {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data, error } = await client.rpc("group_detail", {
    p_group_id: groupId,
  });
  if (error) return null;
  const row = (data as readonly GroupDetailRow[] | null)?.[0];
  if (
    !row ||
    typeof row.name !== "string" ||
    row.name.length === 0 ||
    row.status !== "active" ||
    (row.mode !== "secret_draw" &&
      row.mode !== "gift_everyone" &&
      row.mode !== "wishlist_only")
  ) {
    return null;
  }
  return { name: row.name, mode: row.mode };
}

/**
 * The member wishlist browse route (brief 006e): a protected Server
 * Component route for currently joined, onboarded members reading a
 * currently joined fellow member's wishlist through the shared group. A
 * malformed UUID, unknown group, outsider, pending, declined, left, or
 * removed member, stale target membership, and unknown member all receive
 * the same generic not-found result — no distinction, no group, profile,
 * item, or count data. Signed-out visitors are sent to sign-in by the
 * proxy's protected-route policy; the server-side gate repeats the session
 * and completed-profile checks here.
 *
 * Wishlist data comes from `member_wishlist_snapshot`; friend reaction and
 * reservation projections load only after authorization and the owner
 * redirect. Friend data comes only through authorized projections; the
 * viewer's own copied-state read uses owner-only RLS after browse authorization. The page
 * assembles nothing through separate browser calls. When the target is the viewer themselves, the
 * route performs exactly one server-side redirect to the owner wishlist —
 * no member-wishlist region ever renders for the owner. The single
 * `member_wishlist_viewed` event is emitted exactly once per authorized
 * request, after authorization and before the redirect or render; every
 * denial emits nothing. Every response is no-store through the proxy's
 * protected-route policy.
 */
export default async function MemberWishlistPage({
  params,
}: {
  params: Promise<{ groupId: string; memberId: string }>;
}) {
  const { groupId, memberId } = await params;
  if (!UUID_PATTERN.test(groupId) || !UUID_PATTERN.test(memberId)) notFound();

  const { userId, email, profile } = await requireCompleteProfile();

  const [snapshot, groupFacts] = await Promise.all([
    loadMemberWishlistSnapshot(groupId, memberId),
    loadJoinedGroupFacts(groupId),
  ]);

  const decision = memberWishlistRouteDecision(
    snapshot,
    userId,
    memberId,
    groupFacts?.mode ?? null,
  );
  if (decision.kind === "not-found") notFound();

  // Exactly one server-emitted event per authorized request, after
  // authorization. The event carries only its four closed properties — the
  // group context is not attached for this event.
  const analytics = await getServerAnalytics();
  await analytics.capture(decision.event.name, decision.event.properties, {
    distinctId: userId,
  });

  if (decision.kind === "own") {
    // The owner never sees friend-only framing on their own items: exactly
    // one server-side redirect to the existing owner wishlist.
    redirect("/wishlist");
  }

  const [
    reactions,
    reservations,
    memberVibes,
    copiedItems,
    copiedDestinations,
  ] = await Promise.all([
    getGroupItemReactionSnapshot(groupId, memberId),
    loadGiftingItemStates(groupId, memberId, userId),
    loadGroupMemberVibes(groupId),
    loadOwnCopiedItemIds(decision.items.map((item) => item.itemId)),
    loadGroupCopiedItemIds(
      groupId,
      memberId,
      decision.items.map((item) => item.itemId),
    ),
  ]);

  return (
    <main className="min-h-screen w-full bg-surface-page pb-40 text-content-primary lg:pb-16 lg:pl-64">
      <AnalyticsIdentity userId={userId} />
      <WishlistShellHeader
        email={email}
        displayName={profile.displayName ?? "You"}
        tasteLine={profile.tasteLine}
        vibe={profile.vibe}
      />
      <MemberWishlistScreen
        groupId={groupId}
        groupName={groupFacts?.name ?? ""}
        memberUserId={memberId}
        vibe={memberVibes[memberId]}
        memberDisplayName={decision.memberDisplayName}
        items={decision.items}
        copiedItemIds={copiedDestinations}
        itemReservationBadges={Object.fromEntries(
          Object.entries(reservations).flatMap(([id, state]) =>
            state === "yours" || state === "other"
              ? [[id, state] as const]
              : [],
          ),
        )}
        itemActions={Object.fromEntries(
          decision.items.map((item) => {
            const copy = (
              <CopyToWishlistButton
                groupId={groupId}
                itemId={item.itemId}
                initiallyCopied={copiedItems.has(item.itemId)}
                inline
              />
            );
            const reservation = reservations[item.itemId];
            return [
              item.itemId,
              reservation ? (
                <GiftingReserveControl
                  groupId={groupId}
                  itemId={item.itemId}
                  viewerState={reservation}
                  secondaryAction={copy}
                />
              ) : (
                copy
              ),
            ];
          }),
        )}
        itemControls={Object.fromEntries(
          decision.items.map((item) => {
            const summary = reactions.find((row) => row.itemId === item.itemId);
            return [
              item.itemId,
              <div key={item.itemId}>
                {summary ? (
                  <MemberItemReactions
                    groupId={groupId}
                    initialSummary={summary}
                  />
                ) : null}
              </div>,
            ];
          }),
        )}
      />
    </main>
  );
}
