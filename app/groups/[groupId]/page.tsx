import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { calendarDateInZone } from "@/src/groups/room-format";
import { loadGroupRoomSnapshot } from "@/src/groups/room-data";
import { GroupRoomScreen } from "@/src/groups/room-screen";
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
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  if (!GROUP_ID_PATTERN.test(groupId)) notFound();

  const { userId } = await requireCompleteProfile();

  const room = await loadGroupRoomSnapshot(groupId, userId);
  if (!room) notFound();

  // One server-captured clock for the whole render.
  const today = calendarDateInZone(new Date(), room.timeZone);

  return (
    <main className="min-h-screen w-full bg-surface-page text-content-primary">
      <GroupRoomScreen room={room} callerId={userId} today={today} />
    </main>
  );
}
