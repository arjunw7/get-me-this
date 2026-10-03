import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AnalyticsIdentity } from "@/src/auth/analytics-identity";
import { requireCompleteProfile } from "@/src/profile/session";
import { loadJoinedGroupName } from "@/src/groups/group-write";
import { loadGiftChecklist } from "@/src/groups/gifting";
import { GiftingScreen, type ChecklistRow } from "@/src/groups/gifting-screen";

export const metadata: Metadata = {
  title: "Get Me This | My gifting checklist",
  description: "Your private gift-everyone checklist.",
};
export const dynamic = "force-dynamic";

/**
 * The gift-everyone checklist route (brief 008b). Server-side mode dispatch
 * derived only from reviewed server projections of the stored mode: a group
 * whose stored mode is not `gift_everyone` — and every denied membership —
 * receives the same generic not-found result as an outsider, with no group,
 * member, checklist, or count data in the response. Responses are dynamic
 * and never cached.
 */
export default async function GiftingPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { groupId } = await params;
  const query = await searchParams;

  const { userId } = await requireCompleteProfile();

  const [checklist, groupName] = await Promise.all([
    loadGiftChecklist(groupId),
    loadJoinedGroupName(groupId),
  ]);

  // Null snapshot means every denial class — unknown group, outsider,
  // ineligible membership, or a stored mode that is not `gift_everyone`.
  if (!checklist || !groupName) notFound();

  return (
    <div className="min-h-screen w-full bg-surface-page text-content-primary">
      <AnalyticsIdentity userId={userId} />
      <main>
        <GiftingScreen
          groupId={groupId}
          groupName={groupName}
          rows={checklist}
          conflict={query.conflict === "1"}
        />
      </main>
    </div>
  );
}

export type { ChecklistRow };
