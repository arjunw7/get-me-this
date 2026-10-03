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
 * All page data comes from the one room projection
 * (`public.group_room_snapshot`); no direct profile, member, invitation, or
 * wishlist query exists. The single server-captured clock drives the
 * countdown so the server and any hydrated state cannot disagree at
 * midnight. Every response is no-store through the proxy's protected-route
 * policy, and the page emits no analytics event.
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

  const { userId } = await requireCompleteProfile();

  const room = await loadGroupRoomSnapshot(groupId, userId);
  if (!room) notFound();

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
    />
  ) : null;

  return (
    <main className="min-h-screen w-full bg-surface-page text-content-primary">
      <GroupRoomScreen
        room={room}
        callerId={userId}
        today={today}
        activity={activity}
        organizerTools={organizerTools}
      />
      {room.mode === "secret_draw" ? (
        <div
          className="mx-auto w-full max-w-2xl px-gutter pb-10 sm:pb-14"
          data-ph-no-capture
        >
          <AssignmentView assignment={assignment} />
          {userId === room.organizerId ? (
            <RedrawSection
              groupId={groupId}
              drawState={drawState}
              drawNotice={drawNotice}
              drawAction={runDrawAction}
            />
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
