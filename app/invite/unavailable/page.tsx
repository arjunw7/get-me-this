import type { Metadata } from "next";

import { InviteUnavailableScreen } from "@/src/invite/joined-screen";
import { DiscardProvenFlowsForm } from "@/src/invite/discard-form";

export const metadata: Metadata = {
  title: "Get Me This | Invite unavailable",
  description: "This invite isn't available.",
};
export const dynamic = "force-dynamic";

/**
 * The one generic recovery route (brief 006c): malformed, unknown, expired,
 * revoked, exhausted, missing-cookie, expired-continuation, invalidated,
 * and full-inventory flows all land here. No cause distinction is ever
 * revealed. When the browser holds proven unaccepted flows (the bounded
 * eight-envelope case), the recovery offers the explicit confirmed discard
 * of those proven flows; accepted flows are never discardable.
 */
export default function InviteUnavailablePage() {
  return (
    <main className="min-h-screen w-full bg-surface-page text-content-primary">
      <InviteUnavailableScreen />
      <div className="mx-auto w-full max-w-xl px-gutter pb-10 sm:pb-14">
        <DiscardProvenFlowsForm />
      </div>
    </main>
  );
}
