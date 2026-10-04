import { notFound } from "next/navigation";
import { headers } from "next/headers";

import { getSupabasePublicConfig } from "@/src/supabase/config";
import { InviteBrokerReferenceFixture } from "@/src/invite/broker-reference-fixture";

export const dynamic = "force-dynamic";

/**
 * The no-provider broker-mechanics reference (test-support only): renders
 * the invitation auth-mutation broker fixture under the same loopback and
 * no-provider gates as the action-reference fixture, so the wrapper's
 * redirect semantics are provable without any Supabase configuration.
 */
export default async function InviteBrokerReferencePage() {
  const requestHeaders = await headers();
  const host = (requestHeaders.get("host") ?? "")
    .toLowerCase()
    .replace(/:\d+$/, "");
  const loopback =
    host === "127.0.0.1" || host === "localhost" || host === "[::1]";
  if (
    process.env.E2E_ACTION_REFERENCE !== "1" ||
    process.env.E2E_NO_PROVIDER !== "1" ||
    !loopback ||
    getSupabasePublicConfig() !== null
  )
    notFound();
  return <InviteBrokerReferenceFixture />;
}
