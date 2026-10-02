import type { Metadata } from "next";

import { AnalyticsIdentity } from "@/src/auth/analytics-identity";
import { requireCompleteProfile } from "@/src/profile/session";
import { CreateGroupScreen } from "@/src/groups/create-group-screen";
import { createGroupAction } from "@/src/groups/create-actions";

export const metadata: Metadata = {
  title: "Get Me This | Create a group",
  description: "Make a wishlist. Share it with your people.",
};
export const dynamic = "force-dynamic";

/**
 * The protected group-creation route (brief 006b). The proxy redirects
 * signed-out requests with the safe `create-group` authentication intent
 * (a returning user comes back here; a new user finishes onboarding at
 * `/home` per the approved 004e rule), and `requireCompleteProfile`
 * re-verifies the session and profile on every request.
 */
export default async function NewGroupPage() {
  const { userId } = await requireCompleteProfile();
  return (
    <div className="min-h-screen w-full bg-surface-page text-content-primary">
      <AnalyticsIdentity userId={userId} />
      <main>
        <CreateGroupScreen action={createGroupAction} />
      </main>
    </div>
  );
}
