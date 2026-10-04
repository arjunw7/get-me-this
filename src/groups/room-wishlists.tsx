import { vibeClasses } from "@/src/profile/vibe";
import type { MemberVibes } from "./member-vibes-data";
import Link from "next/link";
import { loadMemberWishlistSnapshot } from "./member-wishlist-data";
import { MemberWishlistItemCard } from "./member-wishlist-screen";
import {
  getGroupItemReactionSnapshot,
  getOwnItemReactionSummary,
} from "./reactions/reaction-write";
import { OwnerReactionSummaryRow } from "./reactions/owner-reaction-summary";
import { MemberItemReactions } from "./member-item-reactions";
import { loadGiftingItemStates } from "./gifting-items-data";
import { initialsFor } from "./room-format";
import type { GroupRoomSnapshot } from "./room-data";

export async function RoomMemberWishlists({
  room,
  callerId,
  assignmentRecipientId = null,
  memberVibes = {},
}: {
  room: GroupRoomSnapshot;
  callerId: string;
  assignmentRecipientId?: string | null;
  memberVibes?: MemberVibes;
}) {
  // Roster membership is presentation, not authority: every wishlist and
  // interaction projection independently repeats the joined-member check.
  const members = room.members
    .filter((member) => member.state === "joined")
    .sort((a, b) => {
      const rank = (id: string) =>
        id === callerId
          ? 2
          : room.mode === "secret_draw" && id === assignmentRecipientId
            ? 0
            : 1;
      return rank(a.userId) - rank(b.userId);
    });
  const rows = await Promise.all(
    members.map(async (member) => {
      const snapshot = await loadMemberWishlistSnapshot(
        room.groupId,
        member.userId,
      );
      if (!snapshot) return null;
      const own = member.userId === callerId;
      const [reactions, ownerReactions, reservations] = await Promise.all([
        own
          ? Promise.resolve([])
          : getGroupItemReactionSnapshot(room.groupId, member.userId),
        own ? getOwnItemReactionSummary() : Promise.resolve([]),
        // Never request or serialize recipient-facing reservation data.
        own
          ? Promise.resolve({})
          : loadGiftingItemStates(room.groupId, member.userId, callerId),
      ]);
      return { member, snapshot, own, reactions, ownerReactions, reservations };
    }),
  );
  return (
    <section aria-label="Member wishlists" className="mt-10 space-y-10">
      {rows.map((row) => {
        if (!row) return null;
        const {
          member,
          snapshot,
          own,
          reactions,
          ownerReactions,
          reservations,
        } = row;
        const firstName =
          snapshot.memberDisplayName.trim().split(/\s+/)[0] ||
          snapshot.memberDisplayName;
        const isDraw =
          !own &&
          room.mode === "secret_draw" &&
          member.userId === assignmentRecipientId;
        return (
          <section
            key={member.userId}
            aria-label={
              own ? "Your wishlist" : `${snapshot.memberDisplayName}'s wishlist`
            }
            className="border-t-2 border-outline-strong/10 pt-8 first:border-t-0 first:pt-0"
          >
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <span
                aria-hidden="true"
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-outline-strong font-display font-bold ${vibeClasses(memberVibes[member.userId])}`}
              >
                {initialsFor(snapshot.memberDisplayName)}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="flex flex-wrap items-center gap-2 font-display text-xl font-extrabold">
                  {own ? "Your wishlist" : `${firstName}'s wishlist`}
                  {isDraw ? (
                    <span className="rounded-pill bg-content-primary px-2 py-0.5 font-sans text-[11px] font-bold text-surface-raised">
                      Your draw
                    </span>
                  ) : null}
                </h2>
                <p className="text-sm text-content-secondary">
                  {own
                    ? "Friends react here. Reservations stay hidden from you."
                    : `${snapshot.items.length} ${snapshot.items.length === 1 ? "thing" : "things"}`}
                </p>
              </div>
              <Link
                href={
                  isDraw
                    ? `/groups/${room.groupId}/gifting`
                    : own
                      ? "/wishlist"
                      : `/groups/${room.groupId}/members/${member.userId}/wishlist`
                }
                className="inline-flex min-h-11 shrink-0 items-center text-sm font-bold"
              >
                {isDraw ? "Open gift plan" : own ? "Edit wishlist" : "View all"}{" "}
                <span aria-hidden="true"> →</span>
              </Link>
            </header>
            {snapshot.items.length === 0 ? (
              <div className="rounded-surface-2xl border-2 border-dashed border-outline-strong/25 px-5 py-8 text-content-secondary">
                {own
                  ? "Your wishlist is waiting for its first thing."
                  : `${snapshot.memberDisplayName} hasn’t added anything yet. Check back soon.`}
              </div>
            ) : (
              <ul
                tabIndex={0}
                className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-5 overflow-x-auto px-5 pb-3 pt-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-outline-strong sm:-mx-8 sm:scroll-px-8 sm:px-8"
                aria-label={
                  own ? "Your items" : `${snapshot.memberDisplayName}'s items`
                }
              >
                {snapshot.items.map((item) => {
                  const reaction = reactions.find(
                    (summary) => summary.itemId === item.itemId,
                  );
                  const ownerReaction = ownerReactions.find(
                    (summary) => summary.itemId === item.itemId,
                  );
                  const reservation = (
                    reservations as Record<
                      string,
                      "unreserved" | "yours" | "other"
                    >
                  )[item.itemId];
                  return (
                    <li
                      key={item.itemId}
                      className="w-[264px] shrink-0 snap-start sm:w-[280px]"
                    >
                      <MemberWishlistItemCard
                        item={item}
                        groupId={room.groupId}
                        compact
                        presentation={own ? "owner" : "room"}
                        reservationBadge={
                          !own &&
                          (reservation === "yours" || reservation === "other")
                            ? reservation
                            : undefined
                        }
                      >
                        {own ? (
                          ownerReaction ? (
                            <OwnerReactionSummaryRow summary={ownerReaction} />
                          ) : null
                        ) : (
                          <>
                            {reaction ? (
                              <MemberItemReactions
                                groupId={room.groupId}
                                initialSummary={reaction}
                              />
                            ) : null}
                          </>
                        )}
                      </MemberWishlistItemCard>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </section>
  );
}
