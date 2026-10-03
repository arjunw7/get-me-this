"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/src/supabase/server";
import { postAuthRouteForUser } from "@/src/profile/session";
import { clearAuthCarry, readAuthCarry, setAuthCarry } from "./carry-cookie";
import { clearLinkCarry, readLinkCarry } from "./link-carry";
import { isValidEmail } from "./email";
import { emailRedirectToForOrigin, requestOrigin } from "./email-redirect";
import { mapRequestCodeFailure, mapVerifyCodeFailure } from "./provider-errors";
import { gateOtpSendRequest, gateOtpVerify } from "./abuse-gate";
import {
  acquireMutationLease,
  deliverMutationPending,
  releaseMutationLease,
} from "@/src/invite/lease-session";
import { parseIntent } from "./fixtures";
import type {
  LinkVerifyState,
  RequestCodeState,
  ResendCodeState,
  VerifyCodeState,
} from "./action-state";

/**
 * Server actions for the email-code flow (004c). Every action re-validates
 * its inputs server-side (the client checks are convenience, not proof),
 * reads the provider configuration on the server only, and maps every
 * provider failure into the closed generic set — no account-specific
 * provider error and no account-existence signal ever reaches the client.
 *
 * The request origin may only select an allowlisted `emailRedirectTo`
 * entry (email-redirect.ts); a non-trusted environment fails safely into
 * the generic recovery state.
 */

const CODE_PATTERN = /^\d{6}$/;

/**
 * The trusted `emailRedirectTo` for this deployment, derived from the
 * request headers against the environment-specific server-side allowlist.
 */
async function trustedEmailRedirectUrl(): Promise<string | null> {
  const headerList = await headers();
  return emailRedirectToForOrigin(
    requestOrigin(headerList.get("host"), headerList.get("x-forwarded-proto")),
  );
}

/** Requests the six-digit email code (new and returning users alike). */
export async function requestCodeAction(
  _previous: RequestCodeState,
  formData: FormData,
): Promise<RequestCodeState> {
  const rawEmail = formData.get("email");
  const rawIntent = formData.get("intent");
  if (typeof rawEmail !== "string" || !isValidEmail(rawEmail)) {
    return { status: "error", failure: "invalid-email" };
  }
  const email = rawEmail.trim();
  // The approved intent enum, parsed exactly as before; unknown values
  // resolve to home both on the page and here.
  const intent = parseIntent(
    typeof rawIntent === "string" ? rawIntent : undefined,
  );

  const supabase = await createSupabaseServerClient();
  const emailRedirectTo = await trustedEmailRedirectUrl();
  if (!supabase || !emailRedirectTo) {
    return { status: "error", failure: "unavailable" };
  }

  // 009b: the durable per-coarse-key send limiter and the Turnstile gate
  // (application-level wiring — see src/auth/captcha.ts). Both denials land
  // in the existing generic recovery classes, byte-identical to the
  // provider's own over-limit/unavailable outcomes.
  const sendDenial = await gateOtpSendRequest(formData);
  if (sendDenial) return { status: "error", failure: sendDenial };

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  });
  if (error) {
    return { status: "error", failure: mapRequestCodeFailure(error) };
  }

  await setAuthCarry(email, intent);
  redirect("/auth/verify");
}

/** Verifies the six-digit code against the carried email. */
export async function verifyCodeAction(
  _previous: VerifyCodeState,
  formData: FormData,
): Promise<VerifyCodeState> {
  const carry = await readAuthCarry();
  if (!carry) return { status: "restart" };

  const rawCode = formData.get("code");
  if (typeof rawCode !== "string" || !CODE_PATTERN.test(rawCode.trim())) {
    return { status: "error", failure: "invalid-code" };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", failure: "unavailable" };

  // Brief 006c criterion 12: this action mutates the session cookies, so
  // while a coordinator cookie exists it participates in the invitation
  // auth-mutation protocol. Blocked: another mutation's delivery is
  // unacknowledged — no provider call, no cookie.
  const acquisition = await acquireMutationLease("otp_verify");
  if (acquisition.outcome === "blocked") {
    return { status: "error", failure: "blocked" };
  }
  const lease = acquisition.outcome === "held" ? acquisition.lease : null;

  // 009b: the durable per-coarse-key verify limiter. A denial reuses the
  // provider's own over-limit class — the approved "Hold on." recovery —
  // with no distinguishing signal.
  const verifyDenial = await gateOtpVerify();
  if (verifyDenial) {
    if (lease) await releaseMutationLease(lease);
    return { status: "error", failure: verifyDenial };
  }

  const { error } = await supabase.auth.verifyOtp({
    email: carry.email,
    token: rawCode.trim(),
    type: "email",
  });
  if (error) {
    if (lease) await releaseMutationLease(lease);
    return { status: "error", failure: mapVerifyCodeFailure(error) };
  }

  // The carry cookie has served its purpose; the session now lives in the
  // standard @supabase/ssr cookie storage.
  await clearAuthCarry();

  // 004e post-auth gate — identical rules for both verification paths: an
  // incomplete profile routes to /onboarding; a complete profile goes
  // straight to the destination resolved through the tested intent table
  // (unbuilt intents land on the honest /home).
  const verified = await supabase.auth.getUser();
  const userId = verified.data.user?.id;
  if (!userId) {
    if (lease) await releaseMutationLease(lease);
    return { status: "error", failure: "unavailable" };
  }
  if (lease) {
    const delivered = await deliverMutationPending(lease, userId, "deliver");
    if (!delivered) await releaseMutationLease(lease);
  }
  redirect(await postAuthRouteForUser(userId, carry.intent));
}

/** Resends the code to the carried email. */
export async function resendCodeAction(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState's (state) signature
  _previous: ResendCodeState,
): Promise<ResendCodeState> {
  const carry = await readAuthCarry();
  if (!carry) return { status: "restart" };

  const supabase = await createSupabaseServerClient();
  const emailRedirectTo = await trustedEmailRedirectUrl();
  if (!supabase || !emailRedirectTo) {
    return { status: "error", failure: "unavailable" };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: carry.email,
    options: { emailRedirectTo },
  });
  if (error) {
    return { status: "error", failure: mapRequestCodeFailure(error) };
  }
  // Re-arm the carry so its expiry matches the freshly sent code.
  await setAuthCarry(carry.email, carry.intent);
  return { status: "resent" };
}

/** Explicit cancel / flow restart: clears the carry cookie, back to entry. */
export async function cancelAuthFlowAction(): Promise<void> {
  await clearAuthCarry();
  redirect("/auth");
}

/**
 * The 004d magic-link completion: the ONLY path that verifies the parked
 * token hash, fired by the explicit "Use my sign-in link" control on the
 * clean /auth/link choice screen. No GET route ever calls verifyOtp.
 *
 * One-shot carriage: the signed link cookie is deleted on every completed
 * attempt — success, provider failure, and every terminal recovery outcome
 * alike — so a double-click or back-button replay finds nothing to
 * re-verify. Crash-safe deletion is deliberately not claimed; the
 * authoritative safeguards are the provider's one-time token semantics and
 * expiry, with deletion as defense in depth.
 *
 * The intent destination is resolved as a VALUE ONLY through the shared
 * 004e post-auth gate (never built from user input); the success boundary
 * is the same gate the code path produces — `/onboarding` for an
 * incomplete profile, the tested intent table's destination for a complete
 * one. A failed verification creates no session and never
 * clears an existing one.
 */
export async function verifyMagicLinkAction(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState's (state) signature
  _previous: LinkVerifyState,
): Promise<LinkVerifyState> {
  const carried = await readLinkCarry();
  // Every completed attempt deletes the link cookie.
  await clearLinkCarry();
  if (!carried) {
    // Missing, malformed, expired, or forged carry: the same honest
    // recovery as a refused token, never an error leak. The completed
    // action's route re-render shows the recovery screen (the cookie is
    // gone), which is exactly the approved terminal state.
    return { status: "error", failure: "rejected-code" };
  }

  // The destination resolves from the 004c carry cookie's approved intent
  // when present, defaulting to home — as a VALUE ONLY, through the
  // shared post-auth gate below, which consumes redirects ONLY via
  // `resolveSafeRedirectTarget` (never user input). The resolved value is
  // pinned by the action-level tests in actions.test.ts (a known
  // `wishlist` intent with a complete profile resolves to `/home`).
  const authCarry = await readAuthCarry();

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", failure: "unavailable" };

  // Brief 006c criterion 12: the magic-link completion mutates the session
  // cookies, so while a coordinator cookie exists it participates in the
  // invitation auth-mutation protocol. Blocked: another mutation's
  // delivery is unacknowledged — no provider call, no cookie.
  const acquisition = await acquireMutationLease("magic_link_verify");
  if (acquisition.outcome === "blocked") {
    return { status: "error", failure: "blocked" };
  }
  const magicLease = acquisition.outcome === "held" ? acquisition.lease : null;

  const { error } = await supabase.auth.verifyOtp({
    token_hash: carried.tokenHash,
    type: carried.type,
  });
  if (error) {
    if (magicLease) await releaseMutationLease(magicLease);
    return { status: "error", failure: mapVerifyCodeFailure(error) };
  }

  // Session equivalence with the code path: verifyOtp wrote the session
  // into the standard @supabase/ssr cookie storage; the response is
  // no-store (proxy policy on Server Action responses). The 004c carry
  // cookie has served its purpose and is cleared. 004e: the SAME post-auth
  // gate as the code path routes the user — incomplete profile to
  // /onboarding, complete profile to the tested intent table's
  // destination.
  await clearAuthCarry();
  const verified = await supabase.auth.getUser();
  const userId = verified.data.user?.id;
  if (!userId) return { status: "error", failure: "unavailable" };
  if (magicLease) {
    const delivered = await deliverMutationPending(
      magicLease,
      userId,
      "deliver",
    );
    if (!delivered) await releaseMutationLease(magicLease);
  }
  redirect(await postAuthRouteForUser(userId, authCarry?.intent));
}

/**
 * The signed-out control (004e): local scope clears this browser's session
 * without revoking other devices' sessions, clears the carry cookie, and
 * returns to the landing page with the approved logged-out copy
 * ("You're logged out. See you soon.", rendered for the `loggedOut` query
 * flag). The client caller resets the typed analytics identity through the
 * approved adapter BEFORE invoking this action, so the authenticated
 * PostHog identity cannot survive the logout.
 */
export async function signOutAction(): Promise<void> {
  // Brief 006c criterion 12: while a coordinator cookie exists, the
  // generic account logout participates in the invitation auth-mutation
  // protocol — the same lease-held cleanup, delivery_pending nonce, and
  // broker acknowledgement as the dedicated invitation logout. Absent
  // that cookie the existing behavior is unchanged.
  const { readCoordinatorCookie } = await import("@/src/invite/flow-session");
  const { signOutWithInvitationCleanupAction } =
    await import("@/src/invite/invite-actions");
  if (await readCoordinatorCookie()) {
    await signOutWithInvitationCleanupAction();
    return;
  }
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut({ scope: "local" });
  }
  await clearAuthCarry();
  redirect("/?loggedOut=1");
}
