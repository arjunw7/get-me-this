import type { Metadata } from "next";

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
export default function InviteUnavailablePage() {
  return (
    <main className="min-h-screen w-full bg-surface-page text-content-primary">
      <InviteUnavailableScreen />
    </main>
  );
}
