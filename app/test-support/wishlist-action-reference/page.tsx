import { notFound } from "next/navigation";
import { headers } from "next/headers";

import { getSupabasePublicConfig } from "@/src/supabase/config";
import { WishlistActionReferenceFixture } from "@/src/wishlist/action-reference-fixture";

export const dynamic = "force-dynamic";

export default async function WishlistActionReferencePage() {
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
  return <WishlistActionReferenceFixture />;
}
