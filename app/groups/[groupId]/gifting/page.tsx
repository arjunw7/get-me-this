import { loadGroupMemberVibes } from "@/src/groups/member-vibes-data";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { AnalyticsIdentity } from "@/src/auth/analytics-identity";
import { requireCompleteProfile } from "@/src/profile/session";
import { WishlistShellHeader } from "@/src/wishlist/wishlist-shell-header";
import { loadGiftChecklist, isGroupIdFormat } from "@/src/groups/gifting";
import { loadGroupRoomSnapshot } from "@/src/groups/room-data";
import { loadMyAssignment } from "@/src/groups/assignment-data";
import { loadMemberWishlistSnapshot } from "@/src/groups/member-wishlist-data";
import { loadGiftingItemStates } from "@/src/groups/gifting-items-data";
import {
  BrowseGiftingScreen,
  GiftingScreen,
  SecretGiftingScreen,
} from "@/src/groups/gifting-screen";
import { GiftingProductGrid } from "@/src/groups/gifting-product-grid";
import { giftingRouteState } from "@/src/groups/gifting-view";
import { budgetFit, giftingMoney } from "@/src/groups/gifting-budget";

export const metadata: Metadata = {
  title: "Get Me This | Your gifting",
  description: "Your private gifting plans.",
};
export const dynamic = "force-dynamic";

/** Membership and stored mode come only from the authorized room projection. */
export default async function GiftingPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { groupId } = await params;
  if (!isGroupIdFormat(groupId)) notFound();
  const { userId, email, profile } = await requireCompleteProfile();
  const room = await loadGroupRoomSnapshot(groupId, userId);
  if (!room) notFound();
  const memberVibes = await loadGroupMemberVibes(groupId);
  const state = giftingRouteState(room.mode, "active");
  let content: ReactNode;
  if (state === "checklist") {
    const rows = await loadGiftChecklist(groupId);
    if (!rows?.length) notFound();
    const recipientContent: Record<string, ReactNode> = {};
    const recipientCounts: Record<string, number> = {};
    const recipientThumbnails: Record<
      string,
      { url: string; title: string }[]
    > = {};
    // Each private checklist row is giver-scoped. Recheck the current joined roster
    // before loading a recipient; a stale roster never grants access to a wishlist.
    const recipients = rows.filter(
      (row) =>
        row.recipientUserId &&
        row.recipientUserId !== userId &&
        room.members.some(
          (member) =>
            member.userId === row.recipientUserId && member.state === "joined",
        ),
    );
    await Promise.all(
      recipients.map(async (row) => {
        const memberId = row.recipientUserId!;
        const snapshot = await loadMemberWishlistSnapshot(groupId, memberId);
        if (!snapshot) return;
        const states = await loadGiftingItemStates(groupId, memberId, userId);
        recipientCounts[memberId] = snapshot.items.length;
        recipientThumbnails[memberId] = snapshot.items
          .filter((item) => item.imageUrl !== null)
          .slice(0, 3)
          .map((item) => ({ url: item.imageUrl!, title: item.title }));
        recipientContent[memberId] = (
          <GiftingProductGrid
            groupId={groupId}
            items={snapshot.items}
            states={states}
            budgetAmount={room.budgetAmountMinor}
            budgetCurrency={room.budgetCurrency}
          />
        );
      }),
    );
    const query = await searchParams;
    content = (
      <GiftingScreen
        groupId={groupId}
        groupName={room.name}
        rows={rows}
        memberVibes={memberVibes}
        conflict={query.conflict === "1"}
        recipientContent={recipientContent}
        recipientCounts={recipientCounts}
        recipientThumbnails={recipientThumbnails}
        pendingMembers={room.members.filter(
          (member) => member.state === "invited",
        )}
      />
    );
  } else if (state === "secret") {
    const assignment = await loadMyAssignment(groupId);
    const recipientId =
      assignment?.isValid && assignment.recipientId !== userId
        ? assignment.recipientId
        : null;
    const snapshot = recipientId
      ? await loadMemberWishlistSnapshot(groupId, recipientId)
      : null;
    const states =
      recipientId && snapshot
        ? await loadGiftingItemStates(groupId, recipientId, userId)
        : {};
    const budget = giftingMoney(room.budgetAmountMinor, room.budgetCurrency);
    const fitCount =
      snapshot?.items.filter(
        (item) =>
          budgetFit(item, room.budgetAmountMinor, room.budgetCurrency) ===
          "within",
      ).length ?? 0;
    content = (
      <SecretGiftingScreen
        groupId={groupId}
        groupName={room.name}
        assignment={assignment}
        recipientVibe={recipientId ? memberVibes[recipientId] : undefined}
      >
        {snapshot ? (
          <>
            <div className="mb-7 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-2xl font-extrabold tracking-tight">
                {snapshot.memberDisplayName}&apos;s wishlist
              </h2>
              {budget ? (
                <p className="text-sm text-content-secondary">
                  Budget {budget} · {fitCount} of {snapshot.items.length} fit
                </p>
              ) : null}
            </div>
            <GiftingProductGrid
              groupId={groupId}
              items={snapshot.items}
              states={states}
              budgetAmount={room.budgetAmountMinor}
              budgetCurrency={room.budgetCurrency}
              columns={2}
            />
          </>
        ) : (
          <p className="rounded-surface-lg border-2 border-dashed border-outline/30 p-6">
            This wishlist is not available right now. Return to your group to
            check for updates.
          </p>
        )}
      </SecretGiftingScreen>
    );
  } else if (state === "browse") {
    content = <BrowseGiftingScreen groupId={groupId} groupName={room.name} />;
  } else notFound();
  return (
    <div className="min-h-screen bg-surface-page pb-32 text-content-primary lg:pb-12 lg:pl-64">
      <AnalyticsIdentity userId={userId} />
      <WishlistShellHeader
        email={email}
        displayName={profile.displayName!}
        tasteLine={profile.tasteLine}
        vibe={profile.vibe}
      />
      <main
        className="mx-auto w-full max-w-7xl px-5 py-5 sm:px-8 lg:px-12 lg:py-10"
        data-ph-no-capture
      >
        {content}
      </main>
    </div>
  );
}
export type { ChecklistRow } from "@/src/groups/gifting";
