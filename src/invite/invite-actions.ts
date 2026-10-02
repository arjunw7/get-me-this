"use server";

import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/src/supabase/server";
import { getServerAnalytics } from "@/src/analytics/server";
import { getSessionUser, getOwnProfile } from "@/src/profile/session";
import { isProfileComplete } from "@/src/profile/profile";
import { isValidEmail } from "@/src/auth/email";
import {
  mapRequestCodeFailure,
  mapVerifyCodeFailure,
} from "@/src/auth/provider-errors";

import {
  COORDINATOR_COOKIE_NAME,
  MUTATION_COOKIE_NAME,
  flowCookieName,
  invitationCookieOptions,
  sealFlowCookie,
  getInvitationCookieSecret,
} from "./continuation-cookie";
import {
  readFlowCookie,
  readAllFlowCookies,
  readCoordinatorCookie,
} from "./flow-session";
import { invitationEmailRedirectTo } from "./email-redirect";
import { normalizeEmail } from "./token";
import {
  acceptFlow,
  bindFlowEmail,
  discardFlow,
  invalidateFlowsForLogout,
  loadFlowState,
  previewFlow,
  verifyFlow,
} from "./invite-write";
import {
  acquireMutationLease,
  deliverMutationPending,
  releaseMutationLease,
  settlePendingDelivery,
} from "./lease-session";
import { clearInviteLinkCarry, parseInviteLinkCarry } from "./link-carry";
import { clearAuthCarry } from "@/src/auth/carry-cookie";

/**
 * The invitation Server Actions (brief 006c). Every action derives its
 * authority server-side: the sealed flow cookie proves the browser
 * binding, the verified Supabase session proves the user, and the database
 * functions re-derive everything from auth.uid(). No action accepts an
 * actor id, invitation id, group id, token, email binding, or membership
 * generation from the browser.
 *
 * Authentication and onboarding NEVER accept the invitation: after either
 * path the person sees the live preview again and must activate Join the
 * group. Acceptance happens only through the explicit same-origin Join
 * POST.
 */

const CODE_PATTERN = /^\d{6}$/;

export type InviteJoinState = {
  readonly status: "idle" | "unavailable" | "retry";
};

export type InviteEmailState = {
  readonly status:
    | "idle"
    | "restart"
    | "unavailable"
    | "invalid-email"
    | "over-limit"
    | "provider";
};

export type InviteVerifyState = {
  readonly status:
    | "idle"
    | "mismatch"
    | "restart"
    | "unavailable"
    | "invalid-code"
    | "over-limit"
    | "provider"
    /**
     * The broker lease is held by a competing mutation (another tab's
     * verify, restart, or logout): this attempt made no provider call and
     * wrote no cookie. The screen renders the honest blocked copy.
     */
    | "blocked"
    /**
     * An unacknowledged broker delivery is still pending: reconciliation
     * may run only after the acknowledgement or recovery settles it.
     */
    | "unacknowledged";
};

export type InviteLinkState = {
  readonly status:
    | "idle"
    | "verified"
    | "mismatch"
    | "restart"
    | "unavailable"
    | "provider"
    | "blocked";
};

/**
 * The explicit Join action: the only path that can invoke continuation
 * acceptance. Same-origin POST only (Next.js Server Actions reject
 * cross-origin submissions before this handler runs); the request-only
 * client may validate the session but the response sets NO cookie — a
 * late Join response can never resurrect cookies cleared by logout.
 */
export async function joinGroupInvitationAction(
  formData: FormData,
): Promise<void> {
  const rawFlowId = formData.get("flowId");
  const flowId = typeof rawFlowId === "string" ? rawFlowId : "";
  const flow = await readFlowCookie(flowId);
  if (!flow) redirect("/invite/unavailable");

  // The profile gate: a signed-out visitor goes to the dedicated
  // invitation email screen; an incomplete profile goes straight to
  // invitation onboarding. Neither accepts the invitation.
  const user = await getSessionUser();
  if (!user) redirect(`/auth/invite/${flowId}`);
  const profile = await getOwnProfile(user.id);
  if (!isProfileComplete(profile?.displayName ?? null)) {
    redirect(`/onboarding/invite/${flowId}`);
  }

  const outcome = await acceptFlow(flowId, flow.browserSecret);

  if (outcome.kind === "accepted") {
    // The one allowed analytics property comes from the continuation's
    // start state, projected to the verified user.
    const state = await loadFlowState(flowId, flow.browserSecret);
    await emitInviteAccepted(
      outcome.acceptedNow,
      state?.beganAuthenticated,
      user.id,
      outcome.groupId,
    );
    redirect(`/invite/continue/${flowId}`);
  }
  // An uncommitted failure (including the rolled-back lost race) stays
  // safely retryable from the live preview; no UI claims a known committed
  // join failed. The generic unavailable cause renders the one recovery.
  if (outcome.kind === "unavailable") {
    redirect("/invite/unavailable");
  }
  redirect(`/invite/continue/${flowId}`);
}

/**
 * The one server-authoritative `invite_accepted` attempt, ONLY for a newly
 * committed acceptance. Allowed property: was_authenticated (the
 * continuation's start state); internal UUID context is permitted. A
 * replay, reconciliation, failure, or unavailable state emits nothing, and
 * an analytics failure never rolls back or misreports membership.
 */
async function emitInviteAccepted(
  acceptedNow: boolean,
  wasAuthenticated: boolean | undefined,
  userId: string,
  groupId: string | null,
): Promise<void> {
  if (!acceptedNow) return;
  try {
    await getServerAnalytics().capture(
      "invite_accepted",
      { was_authenticated: wasAuthenticated === true },
      { distinctId: userId, group: groupId ? { id: groupId } : undefined },
    );
  } catch {
    // Analytics failure cannot roll back or misreport a committed join.
  }
}

/**
 * The invitation email request: validates the flow cookie and live
 * preview, binds the requested email in the database FIRST, and only then
 * asks the provider to send the combined OTP and magic-link message. The
 * flow cookie is resealed with the requested email only after the database
 * binding succeeds. No existing gmt-auth-carry value is read or written.
 */
export async function requestInvitationEmailAction(
  _previous: InviteEmailState,
  formData: FormData,
): Promise<InviteEmailState> {
  const rawFlowId = formData.get("flowId");
  const rawEmail = formData.get("email");
  const flowId = typeof rawFlowId === "string" ? rawFlowId : "";
  const flow = await readFlowCookie(flowId);
  if (!flow) return { status: "unavailable" };

  if (typeof rawEmail !== "string" || !isValidEmail(rawEmail)) {
    return { status: "invalid-email" };
  }
  const email = normalizeEmail(rawEmail);

  // The live preview is both the display source and the liveness gate.
  const preview = await previewFlow(flowId, flow.browserSecret);
  if (!preview) return { status: "unavailable" };

  const binding = await bindFlowEmail(flowId, flow.browserSecret, email);
  if (binding === "restart") return { status: "restart" };
  if (binding === "unavailable") return { status: "unavailable" };

  const supabase = await createSupabaseServerClient();
  const headerList = await headers();
  const { requestOrigin } = await import("@/src/auth/email-redirect");
  const emailRedirectTo = invitationEmailRedirectTo(
    requestOrigin(headerList.get("host"), headerList.get("x-forwarded-proto")),
    flowId,
  );
  if (!supabase || !emailRedirectTo) return { status: "unavailable" };

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  });
  if (error) {
    return mapRequestCodeFailure(error) === "over-limit"
      ? { status: "over-limit" }
      : { status: "provider" };
  }

  // Provider failure leaves the database binding available for a safe
  // same-email retry; the cookie reseal only follows a successful send.
  const secret = getInvitationCookieSecret();
  if (secret) {
    const sealed = await sealFlowCookie(
      { flowId, browserSecret: flow.browserSecret, email },
      Date.now(),
      secret,
    );
    const store = await cookies();
    store.set(flowCookieName(flowId), sealed, {
      ...invitationCookieOptions(3600),
    });
  }
  // Successful send: the requested email travels only inside the resealed
  // flow cookie, and the person continues on the dedicated verify screen —
  // the same split the generic auth flow uses (send, then code entry).
  redirect(`/auth/invite/${flowId}/verify`);
}

/**
 * OTP verification against the cookie-bound requested email. The
 * verification response delivers only the new provider session — it does
 * NOT bind the continuation or accept. Binding happens through the
 * separate, idempotent reconciliation POST (reconcileInvitationAction) so
 * provider success followed by a lost binding response stays recoverable.
 */
export async function verifyInvitationCodeAction(
  _previous: InviteVerifyState,
  formData: FormData,
): Promise<InviteVerifyState> {
  const rawFlowId = formData.get("flowId");
  const rawCode = formData.get("code");
  const flowId = typeof rawFlowId === "string" ? rawFlowId : "";
  const flow = await readFlowCookie(flowId);
  if (!flow || !flow.email) return { status: "restart" };

  if (typeof rawCode !== "string" || !CODE_PATTERN.test(rawCode.trim())) {
    return { status: "invalid-code" };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "unavailable" };

  // Broker lease (criterion 12): this action mutates the session cookies,
  // so it runs under the coordinator's server lease, mirrored by the
  // browser broker's origin-wide Web Lock. Blocked means another
  // mutation's delivery is unacknowledged: this attempt made no provider
  // call and wrote no cookie.
  const acquisition = await acquireMutationLease("otp_verify");
  if (acquisition.outcome === "blocked") return { status: "blocked" };
  const lease = acquisition.outcome === "held" ? acquisition.lease : null;

  // Existing-session preflight: a matching session reconciles WITHOUT
  // re-verifying; a mismatched session is preserved and blocks the
  // provider call. Neither mutates cookies, so the lease is released.
  const existing = await supabase.auth.getUser();
  if (existing.data.user) {
    const existingEmail = existing.data.user.email
      ? normalizeEmail(existing.data.user.email)
      : null;
    if (lease) await releaseMutationLease(lease);
    if (existingEmail === flow.email) {
      const bound = await verifyFlow(flowId, flow.browserSecret);
      if (bound === "verified") redirect(`/invite/continue/${flowId}`);
      return { status: "restart" };
    }
    return { status: "mismatch" };
  }

  const { error } = await supabase.auth.verifyOtp({
    email: flow.email,
    token: rawCode.trim(),
    type: "email",
  });
  if (error) {
    if (lease) await releaseMutationLease(lease);
    const failure = mapVerifyCodeFailure(error);
    return {
      status:
        failure === "rejected-code"
          ? "invalid-code"
          : failure === "over-limit"
            ? "over-limit"
            : "provider",
    };
  }

  // The session cookies ride on THIS response, held in delivery_pending
  // behind the one-use nonce until the broker's acknowledgement verifies
  // the delivered user and advances the epoch. If the lease cannot move,
  // the lease is released and the real session still reconciles — the
  // provider verification already happened.
  if (lease) {
    const verified = await supabase.auth.getUser();
    const delivered = await deliverMutationPending(
      lease,
      verified.data.user?.id ?? null,
      "deliver",
    );
    if (!delivered) await releaseMutationLease(lease);
  }

  // Reconciliation is a separate explicit step that re-derives everything
  // from the session.
  redirect(`/auth/invite/${flowId}/reconcile`);
}

/**
 * The idempotent reconciliation POST: binds the provider-verified session
 * to the continuation. Never re-verifies with the provider, never accepts.
 * Repeating it after a committed bind returns the same verified state; a
 * changed user, email, or expired flow changes nothing.
 */
export async function reconcileInvitationAction(
  _previous: InviteVerifyState,
  formData: FormData,
): Promise<InviteVerifyState> {
  const rawFlowId = formData.get("flowId");
  const flowId = typeof rawFlowId === "string" ? rawFlowId : "";
  const flow = await readFlowCookie(flowId);
  if (!flow) return { status: "restart" };

  // The delivery gate (criterion 12): an unacknowledged broker delivery
  // means the server lease is still in delivery_pending. Reconciliation
  // runs only after that delivery has settled — never on top of it. The
  // gate is self-healing: presenting the one-use nonce to the lease
  // acknowledges a provable delivery (the epoch advances once, the
  // coordinator reseals or clears) and reconciliation continues; an
  // unprovable one stays an honest blocked state.
  const settled = await settlePendingDelivery();
  if (settled === "unproven" || settled === "unavailable") {
    return { status: "unacknowledged" };
  }

  const user = await getSessionUser();
  if (!user) return { status: "restart" };

  const bound = await verifyFlow(flowId, flow.browserSecret);
  if (bound === "verified") redirect(`/invite/continue/${flowId}`);
  return { status: "restart" };
}

/**
 * The magic-link completion: verifies the parked credential ONCE, only
 * when no session exists, and only under this flow's sealed link cookie.
 * Prefetch, GET, back navigation, and email scanners never verify.
 */
export async function verifyInvitationLinkAction(
  _previous: InviteLinkState,
  formData: FormData,
): Promise<InviteLinkState> {
  const rawFlowId = formData.get("flowId");
  const flowId = typeof rawFlowId === "string" ? rawFlowId : "";
  const flow = await readFlowCookie(flowId);
  const carried = flow ? await parseInviteLinkCarry(flowId) : null;
  if (!flow || !carried) return { status: "restart" };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "unavailable" };

  // The same existing-session rule as OTP, checked BEFORE any parked
  // material is removed (review note a): a matching session reconciles
  // without re-verification; a mismatched session is preserved and the
  // parked credential stays parked for the confirmed restart to use.
  const existing = await supabase.auth.getUser();
  if (existing.data.user) {
    const existingEmail = existing.data.user.email
      ? normalizeEmail(existing.data.user.email)
      : null;
    if (existingEmail && flow.email && existingEmail === flow.email) {
      await clearInviteLinkCarry();
      const bound = await verifyFlow(flowId, flow.browserSecret);
      if (bound === "verified") redirect(`/invite/continue/${flowId}`);
      return { status: "restart" };
    }
    return { status: "mismatch" };
  }

  // No session: this is the one provider verification, so it runs under
  // the broker lease like every other session mutation (criterion 12).
  const acquisition = await acquireMutationLease("magic_link_verify");
  if (acquisition.outcome === "blocked") return { status: "blocked" };
  const lease = acquisition.outcome === "held" ? acquisition.lease : null;

  const { error } = await supabase.auth.verifyOtp({
    token_hash: carried.tokenHash,
    type: "email",
  });
  // Every completed attempt removes the parked credential (the provider
  // token's one-time semantics remain the authoritative safeguard).
  await clearInviteLinkCarry();
  if (error) {
    if (lease) await releaseMutationLease(lease);
    return { status: "provider" };
  }

  if (lease) {
    const verified = await supabase.auth.getUser();
    const delivered = await deliverMutationPending(
      lease,
      verified.data.user?.id ?? null,
      "deliver",
    );
    if (!delivered) await releaseMutationLease(lease);
  }

  redirect(`/auth/invite/${flowId}/reconcile`);
}

/**
 * Confirmed account restart after a mismatch: signs out the current
 * session with local scope, removes only parked provider material for this
 * invitation attempt, and retains the browser-bound continuation and
 * requested-email binding. Returns to the invitation email screen for a
 * fresh send.
 */
export async function restartInvitationAuthAction(
  formData: FormData,
): Promise<void> {
  const rawFlowId = formData.get("flowId");
  const flowId = typeof rawFlowId === "string" ? rawFlowId : "";
  if (!flowId) redirect("/invite/unavailable");

  // The restart replaces the session, so it holds the broker lease
  // (criterion 12). Blocked: another mutation's delivery is pending — the
  // screen renders the honest blocked copy and nothing was signed out.
  const acquisition = await acquireMutationLease("account_replace");
  if (acquisition.outcome === "blocked") {
    redirect(`/auth/invite/${flowId}?restartBlocked=1`);
  }
  const lease = acquisition.outcome === "held" ? acquisition.lease : null;

  await clearInviteLinkCarry();

  const supabase = await createSupabaseServerClient();
  if (supabase) {
    // Review note (b): a provider sign-out failure is surfaced honestly.
    // The action redirects back to the invitation email screen with the
    // failure flag and claims no successful restart; the lease is
    // released for a retry.
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      if (lease) await releaseMutationLease(lease);
      redirect(`/auth/invite/${flowId}?restartFailed=1`);
    }
  }

  // Successful replacement: the cleared-session cookies are held in
  // delivery_pending until the broker's acknowledgement verifies the
  // session is really gone.
  if (lease) {
    const delivered = await deliverMutationPending(lease, null, "clear");
    if (!delivered) await releaseMutationLease(lease);
  }
  redirect(`/auth/invite/${flowId}`);
}

/**
 * Explicit discard of every proven unaccepted flow in this browser: each
 * discard proves the coordinator and that flow's browser secret. Used by
 * the recovery state for a full envelope inventory — nothing is evicted
 * implicitly, and accepted flows are never touched by a discard.
 */
export async function discardProvenFlowsAction(): Promise<void> {
  const coordinator = await readCoordinatorCookie();
  const entries = await readAllFlowCookies();
  if (coordinator) {
    for (const entry of entries) {
      await discardFlow(
        entry.flowId,
        entry.cookie.browserSecret,
        coordinator.secret,
      );
    }
  }
  redirect("/invite/unavailable");
}

/**
 * Confirmed-logout cleanup (brief 006c): collects every valid dynamic
 * invitation cookie, calls the authoritative-inventory invalidation with
 * the complete proven list, and only then signs out. A database failure
 * preserves the session and claims no success.
 */
export async function signOutWithInvitationCleanupAction(): Promise<void> {
  // The logout clears the session cookies, so it holds the broker lease
  // (criterion 12). Blocked: another mutation's delivery is pending —
  // the user can retry and nothing was signed out.
  const acquisition = await acquireMutationLease("logout");
  if (acquisition.outcome === "blocked") redirect("/home?logoutBlocked=1");
  const lease = acquisition.outcome === "held" ? acquisition.lease : null;
  const coordinator = lease ? await readCoordinatorCookie() : null;

  if (coordinator) {
    const entries = await readAllFlowCookies();
    const result = await invalidateFlowsForLogout(
      entries.map((entry) => entry.flowId),
      entries.map((entry) => entry.cookie.browserSecret),
      coordinator.secret,
    );
    if (result === "unavailable") {
      // Logout does not clear the session or claim success; the user can
      // retry. The lease is released for that retry.
      if (lease) await releaseMutationLease(lease);
      redirect("/home?logoutFailed=1");
    }
  }

  const supabase = await createSupabaseServerClient();
  if (supabase) {
    // Review note (b) for the logout path too: a provider sign-out
    // failure never claims success.
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      if (lease) await releaseMutationLease(lease);
      redirect("/home?logoutFailed=1");
    }
  }

  const store = await cookies();
  if (lease) {
    // Successful logout: the cleared-session delivery is held in
    // delivery_pending behind the one-use nonce. The coordinator and
    // mutation-nonce cookies are retained — the acknowledgement verifies
    // the session is gone, advances the epoch, releases the lease, and
    // clears them; recovery resolves a lost response honestly.
    const delivered = await deliverMutationPending(lease, null, "clear");
    if (!delivered) await releaseMutationLease(lease);
  }

  // The generic logout also clears the 004c auth carry.
  await clearAuthCarry();

  // Clear every flow envelope and parked credential. With a coordinator,
  // the coordinator and mutation-nonce cookies survive until the
  // acknowledgement or recovery clears them.
  const secret = getInvitationCookieSecret();
  if (secret) {
    for (const cookie of store.getAll()) {
      if (cookie.name.startsWith("__Host-gmt-invite-")) {
        if (coordinator) {
          if (
            cookie.name === COORDINATOR_COOKIE_NAME ||
            cookie.name === MUTATION_COOKIE_NAME
          ) {
            continue;
          }
        }
        store.set(cookie.name, "", {
          ...invitationCookieOptions(0),
        });
      }
    }
  }

  redirect("/?loggedOut=1");
}
