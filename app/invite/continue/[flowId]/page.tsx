import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { loadJoinedGroupName } from "@/src/groups/group-write";
import {
  InviteJoinedScreen,
  InviteUnavailableScreen,
} from "@/src/invite/joined-screen";
import { InvitePreviewScreen } from "@/src/invite/preview-screen";
import { readFlowCookie } from "@/src/invite/flow-session";
import { joinGroupInvitationAction } from "@/src/invite/invite-actions";
import { loadFlowState, previewFlow } from "@/src/invite/invite-write";
import { isFlowId } from "@/src/invite/token";

export const metadata: Metadata = {
  title: "Get Me This | You're invited",
  description: "You're invited to a gifting group.",
};
export const dynamic = "force-dynamic";

/**
 * The clean continuation route (brief 006c): the limited live preview for a
 * valid flow plus browser cookie, or the authenticated joined
 * confirmation. A flow URL without the matching browser cookie reaches the
 * same generic unavailable state as an invalid flow. The page is no-store
 * and no-referrer (proxy policy) and renders no analytics.
 */
export default async function InviteContinuePage({
  params,
}: {
  params: Promise<{ flowId: string }>;
}) {
  const { flowId } = await params;
  if (!isFlowId(flowId)) {
    return (
      <main className="min-h-screen w-full bg-surface-page text-content-primary">
        <InviteUnavailableScreen />
      </main>
    );
  }

  const flow = await readFlowCookie(flowId);
  if (!flow) {
    return (
      <main className="min-h-screen w-full bg-surface-page text-content-primary">
        <InviteUnavailableScreen />
      </main>
    );
  }

  const preview = await previewFlow(flowId, flow.browserSecret);
  if (preview) {
    return (
      <main className="min-h-screen w-full bg-surface-page text-content-primary">
        <InvitePreviewScreen
          flowId={flowId}
          preview={preview}
          joinAction={joinGroupInvitationAction}
        />
      </main>
    );
  }

  // Not previewable: the flow may already be accepted (the joined
  // confirmation reloads write-free) or genuinely unavailable.
  const state = await loadFlowState(flowId, flow.browserSecret);
  if (state && state.state === "accepted" && state.groupId) {
    // The group name renders only from the joined-member projection: the
    // same verified user has actually joined.
    const groupName = await loadJoinedGroupName(state.groupId);
    return (
      <main className="min-h-screen w-full bg-surface-page text-content-primary">
        <InviteJoinedScreen groupName={groupName} groupId={state.groupId} />
      </main>
    );
  }

  redirect("/invite/unavailable");
}
