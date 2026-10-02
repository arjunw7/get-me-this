/**
 * The browser-side invitation auth-mutation broker (brief 006c criteria 5
 * and 12). Every browser-scoped session mutation — invitation provider
 * verification, confirmed restart, and confirmed logout — runs inside this
 * broker: it first acquires the SECOND fixed origin-wide Web Lock (the
 * bootstrap lock is the first; they are distinct names so a bootstrap can
 * never hold the mutation lock), then performs the mutation, and keeps the
 * lock until the mutation's cookie delivery has been settled: a separate
 * acknowledgement POST presents the one-use delivery nonce (carried by the
 * sealed mutation cookie the mutation response delivered) so the server can
 * advance the session epoch and release the coordinator lease; an
 * unresolvable settlement invokes recovery, which acknowledges a provable
 * delivery or honestly abandons it.
 *
 * The lock is held across the whole settle, so a competing tab's mutation
 * cannot begin a provider verification, refresh, account replacement, or
 * sign-out while either layer (this lock, or the server lease it mirrors)
 * is held. Opposite cookie-response delivery orders are therefore
 * prevented, not repaired after the fact.
 *
 * The broker requires the origin-wide lock. A browser without Web Locks
 * never runs the mutation at all — there is no fallback that races cookie
 * delivery (the same rule as the bootstrap start page). Callers render an
 * accessible unsupported state instead.
 */

export const INVITATION_MUTATION_LOCK_NAME = "get-me-this:invite-mutation";

export class InvitationMutationUnsupportedError extends Error {
  constructor() {
    super("invitation mutation lock unsupported");
    this.name = "InvitationMutationUnsupportedError";
  }
}

/**
 * Runs one invitation auth mutation under the origin-wide mutation Web
 * Lock and settles its cookie delivery before releasing the lock. The
 * mutation callable performs the actual POST (a Server Action submission
 * or a broker-route fetch); its redirect/navigation must be a client-side
 * (soft) navigation so this closure survives to settle the delivery.
 */
export async function runInvitationMutation<T>(
  mutation: () => Promise<T>,
): Promise<T> {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.locks?.request !== "function"
  ) {
    throw new InvitationMutationUnsupportedError();
  }
  return navigator.locks.request(INVITATION_MUTATION_LOCK_NAME, async () => {
    try {
      const result = await mutation();
      return result;
    } finally {
      // Settled on every exit path — including a redirect control-flow
      // throw, whose response still delivered the mutation's cookies.
      // The lock is held until the settle completes, so a competing tab's
      // mutation cannot begin while either layer (this lock, or the
      // server lease it mirrors) is held.
      await settleDelivery();
    }
  });
}

/**
 * Extracts a redirect destination from a server action's client-side
 * NEXT_REDIRECT rejection (`digest: "NEXT_REDIRECT;replace;/path;status"`;
 * the unit-test shim uses a colon). Returns null for anything else.
 */
export function redirectTargetFromError(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT")) {
    return null;
  }
  for (const part of digest.split(/[;:]/)) {
    const candidate = part.trim();
    if (candidate.startsWith("/")) return candidate;
  }
  return null;
}

/** The outcome of a brokered server action that may redirect. */
export type BrokeredOutcome<T> =
  | { readonly kind: "result"; readonly value: T }
  | { readonly kind: "redirect"; readonly target: string };

/**
 * Runs one server action under the broker. A redirect rejection is turned
 * into an explicit `redirect` outcome AFTER the delivery has settled
 * inside the lock — the caller navigates (a manually invoked server
 * action's redirect does not navigate by itself), keeping the
 * settle-before-navigation ordering the protocol requires.
 */
export async function runInvitationMutationResolved<T>(
  mutation: () => Promise<T>,
): Promise<BrokeredOutcome<T>> {
  try {
    return { kind: "result", value: await runInvitationMutation(mutation) };
  } catch (error) {
    const target = redirectTargetFromError(error);
    if (target === null) throw error;
    return { kind: "redirect", target };
  }
}

/**
 * Wraps a server action for `useActionState` so its submission runs under
 * the origin-wide mutation Web Lock with a settled delivery. When the
 * action redirects, the router's own RedirectBoundary performs the
 * navigation (the server-action reducer rejects the action promise AND
 * applies the redirect); the wrapper swallows that rejection after the
 * settle and leaves the state as it was — the navigation leaves the
 * screen anyway. Navigating manually here as well would race the router's
 * navigation and abort the redirect's RSC stream mid-flight.
 */
export function brokeredServerAction<S>(
  action: (previousState: S, formData: FormData) => Promise<S>,
): (previousState: S, formData: FormData) => Promise<S> {
  return async (previousState, formData) => {
    try {
      return await runInvitationMutation(() => action(previousState, formData));
    } catch (error) {
      if (redirectTargetFromError(error) !== null) return previousState;
      throw error;
    }
  };
}

/**
 * Settles the mutation's cookie delivery: acknowledge presents the sealed
 * one-use nonce; when the acknowledgement cannot prove the delivery (no
 * nonce cookie, expired envelope, user mismatch, or a lost response), the
 * recovery route resolves the server lease honestly instead. Both fetches
 * are bounded — a settlement that never returns would hold the origin
 * lock forever and silently wedge every later mutation behind it.
 */
async function settleDelivery(): Promise<void> {
  let acknowledged = false;
  try {
    const response = await fetch("/auth/invite/mutation/acknowledge", {
      method: "POST",
      credentials: "same-origin",
      signal: AbortSignal.timeout(10_000),
    });
    acknowledged = response.ok;
  } catch {
    acknowledged = false;
  }
  if (acknowledged) return;
  try {
    await fetch("/auth/invite/mutation/recover", {
      method: "POST",
      credentials: "same-origin",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Recovery itself is unreachable: the server lease's bounded
    // acquisition expiry plus the blocked-state UI keep later mutations
    // honest; a later mutation's own settle retries this recovery.
  }
}
