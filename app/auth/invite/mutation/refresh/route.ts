import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/src/supabase/server";
import { getSessionUser } from "@/src/profile/session";
import {
  acquireMutationLease,
  deliverMutationPending,
  releaseMutationLease,
} from "@/src/invite/lease-session";

/**
 * The explicit brokered session refresh (brief 006c criterion 12): the
 * refresh auth mutation acquires the coordinator's server lease under the
 * browser broker's Web Lock, and its refreshed session cookies are held
 * in delivery_pending behind the one-use nonce until the broker's
 * acknowledgement verifies the refreshed session and advances the epoch.
 * A failed refresh releases the lease honestly: the caller re-authenticates.
 */

const NO_STORE = "no-store";

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", NO_STORE);
  return response;
}

export async function POST(): Promise<NextResponse> {
  const acquisition = await acquireMutationLease("refresh");
  if (acquisition.outcome !== "held") {
    return json({ status: acquisition.outcome }, 409);
  }
  const lease = acquisition.lease;

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    await releaseMutationLease(lease);
    return json({ status: "reauth" }, 200);
  }

  const { error } = await supabase.auth.refreshSession();
  if (error) {
    await releaseMutationLease(lease);
    return json({ status: "reauth" }, 200);
  }

  const user = await getSessionUser();
  const delivered = await deliverMutationPending(
    lease,
    user?.id ?? null,
    "deliver",
  );
  if (!delivered) await releaseMutationLease(lease);
  // The refreshed cookies ride on this response; when they could not be
  // marked pending, the acknowledgement's recovery resolves the lease
  // honestly.
  return json({ status: "delivered" }, 200);
}
