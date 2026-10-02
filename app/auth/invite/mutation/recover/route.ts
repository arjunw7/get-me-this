import { NextResponse } from "next/server";
import { cookies } from "next/headers";

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
import { recoverAuthLease } from "@/src/invite/invite-write";

/**
 * Broker recovery (brief 006c criterion 12): resolves a lease whose
 * mutation response was lost while the browser still held the mutation
 * Web Lock. Recovery never grants permission to a competing mutation:
 * a provable delivery (the nonce cookie still presents the expected
 * evidence) is acknowledged — the epoch advances exactly once and the
 * coordinator is resealed — and anything else is abandoned to idle for an
 * honest fresh-credential restart. `delivery_pending` never silently
 * expires into permission.
 */

const NO_STORE = "no-store";

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", NO_STORE);
  return response;
}

export async function POST(): Promise<NextResponse> {
  const secret = getInvitationCookieSecret();
  if (!secret) return json({ ok: false, status: "unconfigured" }, 200);

  const coordinator = await readCoordinatorCookie();
  if (!coordinator) {
    // No coordinator row to recover; a stale nonce cookie is cleared.
    await clearMutationDelivery();
    return json({ ok: true, status: "absent" }, 200);
  }

  const mutation = await readMutationDelivery();
  const result = await recoverAuthLease(
    coordinator.secret,
    mutation ? mutation.nonce : null,
  );
  await clearMutationDelivery();

  if (
    result.outcome === "acknowledged" &&
    result.sessionEpoch !== null &&
    mutation?.kind === "deliver"
  ) {
    // The delivered cookies were applied: reseal the coordinator with the
    // advanced epoch so the next mutation compares-and-swaps correctly.
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

  if (
    result.outcome === "acknowledged" &&
    result.sessionEpoch !== null &&
    mutation?.kind === "clear"
  ) {
    // The cleared-session cookies were applied: the completed logout's
    // coordination cookie is cleared with the released lease.
    const store = await cookies();
    store.set(COORDINATOR_COOKIE_NAME, "", {
      ...invitationCookieOptions(0),
    });
    return json({ ok: true, status: "acknowledged" }, 200);
  }

  // Abandoned or already idle: the coordinator keeps its epoch, and a
  // fresh-credential restart can proceed honestly.
  return json({ ok: true, status: result.outcome }, 200);
}
