"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/src/supabase/server";
import { clearAuthCarry, readAuthCarry, setAuthCarry } from "./carry-cookie";
import { clearLinkCarry, readLinkCarry } from "./link-carry";
import { resolveSafeRedirectTarget } from "./link-intents";
import { isValidEmail } from "./email";
import { emailRedirectToForOrigin, requestOrigin } from "./email-redirect";
import { mapRequestCodeFailure, mapVerifyCodeFailure } from "./provider-errors";
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

  const { error } = await supabase.auth.verifyOtp({
    email: carry.email,
    token: rawCode.trim(),
    type: "email",
  });
  if (error) {
    return { status: "error", failure: mapVerifyCodeFailure(error) };
  }

  // The carry cookie has served its purpose; the session now lives in the
  // standard @supabase/ssr cookie storage.
  await clearAuthCarry();
  return { status: "verified" };
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
 * The intent destination is resolved as a VALUE ONLY through the tested
 * intent-to-route table (never navigated in 004d, never built from user
 * input); the success boundary is the same approved signed-in state the
 * code path produces. A failed verification creates no session and never
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
  // when present, defaulting to home — as a VALUE ONLY, through the tested
  // intent-to-route table of server-defined routes (never user input).
  // 004e owns serving and navigating those routes and must consume
  // redirects ONLY via `resolveSafeRedirectTarget`; 004d's success boundary
  // is the approved signed-in state on the verification experience. The
  // resolved value is pinned by the action-level test in actions.test.ts
  // (known `wishlist` intent resolves to `/home`).
  const authCarry = await readAuthCarry();
  const resolvedRoute = resolveSafeRedirectTarget(authCarry?.intent);
  void resolvedRoute;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", failure: "unavailable" };

  const { error } = await supabase.auth.verifyOtp({
    token_hash: carried.tokenHash,
    type: carried.type,
  });
  if (error) {
    return { status: "error", failure: mapVerifyCodeFailure(error) };
  }

  // Session equivalence with the code path: verifyOtp wrote the session
  // into the standard @supabase/ssr cookie storage; the response is
  // no-store (proxy policy on Server Action responses). The 004c carry
  // cookie has served its purpose and is cleared, so the verified screen
  // renders the approved signed-in boundary — the same state the code
  // path produces.
  await clearAuthCarry();
  redirect("/auth/verify");
}

/**
 * The minimal signed-out control: local scope clears this browser's
 * session without revoking other devices' sessions (004c boundary — the
 * full account menu and session lifecycle are 004e).
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut({ scope: "local" });
  }
  await clearAuthCarry();
  redirect("/auth");
}
