import "server-only";

import { cookies } from "next/headers";

import {
  COORDINATOR_COOKIE_NAME,
  MUTATION_COOKIE_NAME,
  invitationCookieOptions,
  sealCoordinatorCookie,
  sealMutationCookie,
  getInvitationCookieSecret,
} from "./continuation-cookie";
import { readCoordinatorCookie } from "./flow-session";
import {
  acquireAuthLease,
  markDeliveryPending,
  recoverAuthLease,
} from "./invite-write";
import { generateCanonicalSecret } from "./token";

/**
 * The server side of the invitation auth-mutation broker (brief 006c
 * criteria 5 and 12). The browser broker holds the second fixed
 * origin-wide Web Lock around every session-cookie-mutating auth path —
 * invitation provider verification, confirmed restart, confirmed logout,
 * the generic verify paths, and the explicit refresh — while these
 * helpers compare-and-swap the coordinator's session epoch on the server.
 *
 * A successful mutation moves the lease to `delivery_pending` and seals a
 * one-use delivery nonce cookie whose response carries the mutation's
 * cookie effects; the separate acknowledgement route verifies the
 * delivered session (or its absence), advances the epoch exactly once,
 * reseals the coordinator, and releases the lease. Recovery resolves a
 * lost response honestly — acknowledged, abandoned, or still blocked —
 * and `delivery_pending` never silently expires into permission.
 */

export type MutationLeaseKind =
  "otp_verify" | "magic_link_verify" | "refresh" | "logout" | "account_replace";

/** A held server lease, bound to the coordinator secret and its epoch. */
export type MutationLease = {
  readonly coordinatorSecret: string;
  readonly epoch: number;
};

export type MutationLeaseAcquisition =
  | { readonly outcome: "held"; readonly lease: MutationLease }
  /** Another mutation's delivery is unacknowledged: participate later. */
  | { readonly outcome: "blocked" }
  /** No coordinator cookie: the existing unbrokered behavior applies. */
  | { readonly outcome: "absent" };

/**
 * Acquires the coordinator's server lease for one session mutation, or
 * reports the honest blocked state. Nothing is written when blocked.
 */
export async function acquireMutationLease(
  kind: MutationLeaseKind,
): Promise<MutationLeaseAcquisition> {
  const coordinator = await readCoordinatorCookie();
  if (!coordinator) return { outcome: "absent" };
  const lease = await acquireAuthLease(
    coordinator.secret,
    coordinator.epoch,
    kind,
  );
  if (lease.outcome !== "acquired") return { outcome: "blocked" };
  return {
    outcome: "held",
    lease: { coordinatorSecret: coordinator.secret, epoch: coordinator.epoch },
  };
}

/**
 * Releases a held lease after a path that ended up mutating nothing
 * (existing-session shortcuts, provider failures). Recovery abandons the
 * lease to idle so a fresh attempt can proceed.
 */
export async function releaseMutationLease(
  lease: MutationLease,
): Promise<void> {
  await recoverAuthLease(lease.coordinatorSecret, null);
}

export type MutationDeliveryKind = "deliver" | "clear";

/**
 * Moves a held lease to `delivery_pending` and seals the one-use nonce
 * cookie the acknowledgement route presents. Returns false when the lease
 * could not move (the caller releases it honestly); the mutation's own
 * cookie effects ride on the same response either way.
 */
export async function deliverMutationPending(
  lease: MutationLease,
  expectedProviderUserId: string | null,
  kind: MutationDeliveryKind,
): Promise<boolean> {
  const nonce = generateCanonicalSecret();
  const pending = await markDeliveryPending(
    lease.coordinatorSecret,
    lease.epoch,
    nonce,
    expectedProviderUserId,
  );
  if (pending.outcome !== "pending") return false;
  const secret = getInvitationCookieSecret();
  if (!secret) return false;
  const sealed = await sealMutationCookie(
    { nonce, kind, userId: expectedProviderUserId },
    Date.now(),
    secret,
  );
  const store = await cookies();
  store.set(MUTATION_COOKIE_NAME, sealed, invitationCookieOptions(120));
  return true;
}

/**
 * Settles a lingering unacknowledged delivery at the next brokered touch
 * (brief 006c criterion 12's recovery path): present the one-use nonce to
 * the lease and let the database decide. A provable delivery is
 * acknowledged — the epoch advances exactly once, the coordinator reseals
 * (or clears, for sign-out) — and the caller continues; an unprovable one
 * stays honest. Returns `unavailable` when another mutation still holds
 * the lease, keeping the nonce for a later attempt.
 */
export async function settlePendingDelivery(): Promise<
  "acknowledged" | "absent" | "unproven" | "unavailable"
> {
  const store = await cookies();
  const delivered = await readMutationDelivery();
  if (!delivered) return "absent";
  const coordinator = await readCoordinatorCookie();
  if (!coordinator) {
    // The response carrying the mutation's cookie effects landed, but the
    // coordinator it belonged to is gone: the nonce is spent either way.
    store.delete(MUTATION_COOKIE_NAME);
    return "absent";
  }
  const recovered = await recoverAuthLease(coordinator.secret, delivered.nonce);
  store.delete(MUTATION_COOKIE_NAME);
  if (recovered.outcome === "unavailable") return "unavailable";
  if (recovered.outcome !== "acknowledged") return "unproven";
  if (delivered.kind === "clear") {
    store.set(COORDINATOR_COOKIE_NAME, "", invitationCookieOptions(0));
  } else {
    const secret = getInvitationCookieSecret();
    if (!secret) return "unproven";
    store.set(
      COORDINATOR_COOKIE_NAME,
      await sealCoordinatorCookie(
        coordinator.secret,
        recovered.sessionEpoch,
        Date.now(),
        secret,
      ),
      invitationCookieOptions(),
    );
  }
  return "acknowledged";
}
