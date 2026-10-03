import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getSessionUser } from "@/src/profile/session";
import {
  COORDINATOR_COOKIE_NAME,
  getInvitationCookieSecret,
  invitationCookieOptions,
  sealCoordinatorCookie,
} from "@/src/invite/continuation-cookie";
import {
  clearMutationDelivery,
  readCoordinatorCookie,
  readMutationDelivery,
} from "@/src/invite/flow-session";
import {
  acknowledgeDelivery,
  recoverAuthLease,
} from "@/src/invite/invite-write";

/**
 * The broker delivery acknowledgement (brief 006c criterion 12): the
 * browser broker POSTs this while still holding the origin-wide mutation
 * Web Lock, presenting the sealed one-use delivery nonce its mutation
 * response delivered.
 *
 * A `deliver` delivery is acknowledged only when the presented session is
 * the expected provider user; a `clear` delivery only when the provider
 * session is really gone. Acknowledgement advances the coordinator's
 * session epoch exactly once, reseals the coordinator cookie, releases
 * the lease, and clears the nonce cookie. Anything else never releases
 * the lease with permission: recovery resolves it honestly instead.
 */

const NO_STORE = "no-store";

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", NO_STORE);
  return response;
}

export async function POST(): Promise<NextResponse> {
  const secret = getInvitationCookieSecret();
  if (!secret) return json({ ok: false, reason: "unconfigured" }, 200);

  const mutation = await readMutationDelivery();
  if (!mutation) {
    // No unacknowledged delivery: the broker's recovery handles any real
    // lease state; this POST is a no-op (e.g. a non-invitation logout).
    return json({ ok: false, reason: "no-delivery" }, 409);
  }

  const coordinator = await readCoordinatorCookie();
  if (!coordinator) {
    // The coordinator is already gone: keep the browser consistent.
    await clearMutationDelivery();
    return json({ ok: true, status: "absent" }, 200);
  }

  const user = await getSessionUser();

  if (mutation.kind === "deliver") {
    if (!user || user.id !== mutation.userId) {
      // The expected session never landed (or an unexpected user is
      // present): the delivery is not proven, so it is never acknowledged
      // with permission. Recovery abandons the lease to idle.
      await recoverAuthLease(coordinator.secret, null);
      await clearMutationDelivery();
      return json({ ok: false, reason: "unproven" }, 409);
    }
  } else if (user) {
    // A `clear` delivery is acknowledged only when the session is really
    // gone; a resolving session means the cleared cookies did not apply.
    await recoverAuthLease(coordinator.secret, null);
    await clearMutationDelivery();
    return json({ ok: false, reason: "session-present" }, 409);
  }

  const result = await acknowledgeDelivery(
    coordinator.secret,
    mutation.nonce,
    mutation.userId,
  );
  await clearMutationDelivery();

  if (result.outcome !== "acknowledged" || result.sessionEpoch === null) {
    // The one-use nonce was not provable at the database. Nothing was
    // released by this route; the broker's recovery resolves the lease.
    return json({ ok: false, reason: "unproven" }, 409);
  }

  if (mutation.kind === "clear") {
    // The completed logout's coordination cookies are cleared with the
    // released lease.
    const store = await cookies();
    store.set(COORDINATOR_COOKIE_NAME, "", {
      ...invitationCookieOptions(0),
    });
    return json({ ok: true, status: "acknowledged" }, 200);
  }

  // The epoch advanced exactly once: reseal the coordinator so the next
  // mutation compares-and-swaps against the new epoch.
  const resealed = await sealCoordinatorCookie(
    coordinator.secret,
    result.sessionEpoch,
    Date.now(),
    secret,
  );
  const store = await cookies();
  store.set(COORDINATOR_COOKIE_NAME, resealed, {
    ...invitationCookieOptions(86400),
  });
  return json({ ok: true, status: "acknowledged" }, 200);
}
