import type { Metadata } from "next";
import { requireCompleteProfile } from "@/src/profile/session";
import { WishlistShellHeader } from "@/src/wishlist/wishlist-shell-header";
import { GroupsIndex } from "@/src/home/groups-index";
import { AnalyticsIdentity } from "@/src/auth/analytics-identity";
import { loadMyGroups } from "@/src/home/my-groups-data";

export const metadata: Metadata = { title: "Get Me This | Groups" };

export default async function GroupsPage() {
  const { userId, email, profile } = await requireCompleteProfile();
  const groups = await loadMyGroups();
  return (
    <div className="min-h-screen bg-surface-page pb-40 text-content-primary lg:pb-16 lg:pl-64">
      <AnalyticsIdentity userId={userId} />
      <WishlistShellHeader
        email={email}
        displayName={profile.displayName as string}
        tasteLine={profile.tasteLine}
        vibe={profile.vibe}
      />
      <GroupsIndex groups={groups} />
    </div>
  );
}
