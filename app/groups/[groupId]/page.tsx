import { loadGroupMemberVibes } from "@/src/groups/member-vibes-data";
import Link from "next/link";
import { WishlistShellHeader } from "@/src/wishlist/wishlist-shell-header";
import { RoomMemberWishlists } from "@/src/groups/room-wishlists";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getServerAnalytics } from "@/src/analytics/server";
import { loadGroupActivity } from "@/src/groups/activity-data";
import {
  groupActivityViewedEvent,
  type GroupActivityMode,
} from "@/src/groups/activity-view";
import { calendarDateInZone } from "@/src/groups/room-format";
import { loadGroupRoomSnapshot } from "@/src/groups/room-data";
import { GroupRoomScreen } from "@/src/groups/room-screen";
import { loadDrawState, loadMyAssignment } from "@/src/groups/assignment-data";
import { AssignmentView } from "@/src/groups/assignment-view";
import { RedrawSection } from "@/src/groups/redraw-section";
import { runDrawAction } from "@/src/groups/draw-actions";
import { loadMemberAdminState } from "@/src/groups/member-admin-data";
import { OrganizerTools } from "@/src/groups/organizer-tools";
import { deleteGroupAction } from "@/src/groups/delete-group-action";
import {
  removeGroupMemberAction,
  transferOrganizerAction,
  revokeInvitationAction,
  reinviteMemberAction,
} from "@/src/groups/member-admin-actions";
import { requireCompleteProfile } from "@/src/profile/session";

export const metadata: Metadata = {
  title: "Get Me This | Group room",
  description: "Your private group room.",
};
export const dynamic = "force-dynamic";

const GROUP_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The private group room route (brief 006d): a protected Server Component
 * route for currently joined, onboarded members. A malformed UUID,
 * nonexistent group, inactive group, outsider, invited-but-not-joined,
 * declined, left, or removed member all receive the same not-found result —
 * no distinction, no group name, no counts. Signed-out visitors are sent to
 * sign-in by the proxy's protected-route policy (safe `home` intent) and the
 * server-side gate repeats the session and completed-profile checks here.
 *
 * The room gate uses `group_room_snapshot`. Each member wishlist and
 * interaction row then comes from its reviewed, independently authorized
 * projection; owner rows never load gifting state. There are no direct
 * profile/member/item joins. A single server-captured clock drives the
 * countdown. The protected-route policy makes every response no-store.
 */
export default async function GroupRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { groupId } = await params;
  if (!GROUP_ID_PATTERN.test(groupId)) notFound();

  const { userId, email, profile } = await requireCompleteProfile();

  const room = await loadGroupRoomSnapshot(groupId, userId);
  if (!room) notFound();
  const memberVibes = await loadGroupMemberVibes(groupId);

  // Brief 007d: the authorized activity page loads through its single
  // projection; the one server-emitted event fires exactly once per
  // authorized render, after authorization, over the viewer's visible
  // entries only. Every denial of the room already returned above and
  // emitted nothing.
  const activity = await loadGroupActivity(groupId);
  const analytics = await getServerAnalytics();
  await analytics.capture(
    "group_activity_viewed",
    groupActivityViewedEvent(activity.length, room.mode as GroupActivityMode)
      .properties,
    { distinctId: userId },
  );

  // One server-captured clock for the whole render.
  const today = calendarDateInZone(new Date(), room.timeZone);

  // 008d surfaces, loaded only for secret_draw rooms: the giver's own
  // assignment (every joined member) and the organizer's draw existence
  // metadata. Both projections map every denial class to the same null.
  const assignment =
    room.mode === "secret_draw" ? await loadMyAssignment(groupId) : null;
  const drawState =
    room.mode === "secret_draw" && userId === room.organizerId
      ? await loadDrawState(groupId)
      : null;

  const drawParam = await searchParams;
  const drawRaw = drawParam.draw;
  const drawNotice =
    room.mode === "secret_draw" && userId === room.organizerId
      ? typeof drawRaw === "string" &&
        ["drawn", "stale", "insufficient", "unavailable"].includes(drawRaw)
        ? drawRaw
        : null
      : null;

  // Brief 006f: the organizer membership tools render only for the current
  // joined organizer. A non-organizer caller never triggers the admin
  // projections — the payload carries nothing about them, including audit
  // rows or former-member states. Any shape the admin loader refuses maps to
  // no tools at all, never a degraded disclosure.
  const adminState =
    room.organizerId === userId
      ? await loadMemberAdminState(room.groupId, room.organizerId, userId)
      : null;
  const organizerTools = adminState ? (
    <OrganizerTools
      presentation="room"
      groupId={adminState.groupId}
      groupName={room.name}
      organizerId={room.organizerId}
      initialVersion={adminState.version}
      members={adminState.members}
      liveInvitations={adminState.liveInvitations}
      audit={adminState.audit}
      removeAction={removeGroupMemberAction}
      transferAction={transferOrganizerAction}
      revokeAction={revokeInvitationAction}
      reinviteAction={reinviteMemberAction}
      deleteAction={deleteGroupAction}
    />
  ) : null;

  return (
    <main className="min-h-screen w-full bg-surface-page pb-40 text-content-primary lg:pb-16 lg:pl-64">
      <WishlistShellHeader
        email={email}
        displayName={profile.displayName ?? "You"}
        tasteLine={profile.tasteLine}
        vibe={profile.vibe}
      />
      <GroupRoomScreen
        memberVibes={memberVibes}
        room={room}
        callerId={userId}
        today={today}
        activity={activity}
        organizerTools={organizerTools}
        modeStatus={
          <section className="mt-6 flex flex-col gap-4 rounded-surface-2xl border-2 border-outline-strong bg-surface-raised p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-extrabold">
                {room.mode === "wishlist_only"
                  ? "No assignments, no pressure."
                  : room.mode === "gift_everyone"
                    ? `${Math.max(0, room.joinedMemberCount - 1)} people on your list.`
                    : assignment?.isValid
                      ? "Names have been drawn."
                      : assignment
                        ? "The group has changed."
                        : "The draw is still ahead."}
              </h2>
              <p className="mt-1 text-[15px] text-content-secondary">
                {room.mode === "wishlist_only"
                  ? "Scroll, react, and reserve anything. Recipients never see it."
                  : room.mode === "gift_everyone"
                    ? "Pick something for everyone. Your checklist is private."
                    : assignment?.isValid
                      ? "Only you know who you got. Keep that poker face."
                      : assignment
                        ? "Your organizer can run a fresh draw."
                        : "Once names are drawn, your private gift plan will be here."}
              </p>
            </div>
            {room.mode !== "wishlist_only" ? (
              <Link
                href={`/groups/${groupId}/gifting`}
                className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-surface-lg border-2 border-outline-strong bg-accent-highlight px-5 font-bold shadow-chunk-sm"
              >
                {room.mode === "gift_everyone"
                  ? "Open my checklist"
                  : "Open my gift plan"}
                <span aria-hidden="true"> →</span>
              </Link>
            ) : null}
          </section>
        }
        memberWishlists={
          <RoomMemberWishlists
            memberVibes={memberVibes}
            room={room}
            callerId={userId}
            assignmentRecipientId={
              assignment?.isValid ? assignment.recipientId : null
            }
          />
        }
        drawControls={
          room.mode === "secret_draw" ? (
            <details
              open={drawNotice !== null}
              className="mt-8 rounded-surface-lg border-2 border-outline-subtle bg-surface-raised p-5"
              data-ph-no-capture
            >
              <summary className="cursor-pointer font-bold">
                Your draw details
                {userId === room.organizerId ? " and draw controls" : ""}
              </summary>
              <AssignmentView assignment={assignment} />
              {userId === room.organizerId ? (
                <RedrawSection
                  groupId={groupId}
                  drawState={drawState}
                  drawNotice={drawNotice}
                  drawAction={runDrawAction}
                />
              ) : null}
            </details>
          ) : null
        }
      />
    </main>
  );
}
