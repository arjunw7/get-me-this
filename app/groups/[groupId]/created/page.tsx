import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AnalyticsIdentity } from "@/src/auth/analytics-identity";
import { requireCompleteProfile } from "@/src/profile/session";
import { CreatedScreen } from "@/src/groups/created-screen";
import {
  loadJoinedGroupName,
  loadOrganizerInvitationState,
} from "@/src/groups/group-write";
import {
  refreshInvitationStateAction,
  issueGroupInviteLinkAction,
} from "@/src/groups/invitation-actions";

export const metadata: Metadata = {
  title: "Get Me This | Group created",
  description: "Your group is ready.",
};
export const dynamic = "force-dynamic";

/**
 * The organizer-only created route (brief 006b): the redirect target of a
 * successful creation. Visible only to the joined organizer — an outsider, a
 * nonmember, a left or removed member, and a joined non-organizer all receive
 * the same not-found result with no group data (the invitation-state
 * projection is empty for everyone but the joined organizer).
 */
export default async function GroupCreatedPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      groupId,
    )
  ) {
    notFound();
  }

  const { userId } = await requireCompleteProfile();

  const [invitationState, groupName] = await Promise.all([
    loadOrganizerInvitationState(groupId),
    loadJoinedGroupName(groupId),
  ]);

  // No organizer invitation state means not an organizer: the honest,
  // non-enumerating result is the same not-found as any unknown group.
  if (!invitationState || !groupName) notFound();

  return (
    <div className="min-h-screen w-full bg-surface-page text-content-primary">
      <AnalyticsIdentity userId={userId} />
      <main>
        <CreatedScreen
          groupId={groupId}
          groupName={groupName}
          initialState={invitationState}
          issueAction={issueGroupInviteLinkAction}
          refreshAction={refreshInvitationStateAction}
        />
      </main>
    </div>
  );
}
