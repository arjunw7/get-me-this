import type { Metadata } from "next";

import { getSessionUser } from "@/src/profile/session";

import { InviteUnavailableScreen } from "@/src/invite/joined-screen";

export const metadata: Metadata = {
  title: "Get Me This | Invite unavailable",
  description: "This invite isn't available.",
};
export const dynamic = "force-dynamic";

/**
 * The one generic recovery route (brief 006c): malformed, unknown, expired,
 * revoked, exhausted, missing-cookie, expired-continuation, invalidated,
 * and full-inventory flows all land here. No cause distinction is ever
 * revealed. The recovery page offers one navigation action; it does not
 * mutate unfinished invitation continuations.
 */
export default async function InviteUnavailablePage() {
  const user = await getSessionUser();
  return (
    <main className="min-h-screen w-full bg-surface-page text-content-primary">
      <InviteUnavailableScreen returnHref={user ? "/home" : "/"} />
    </main>
  );
}
