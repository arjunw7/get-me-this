import "server-only";

/**
 * Turnstile CAPTCHA for the OTP send surface (009b).
 *
 * Selection: Cloudflare Turnstile (free, no payment, privacy-friendly),
 * fallback hCaptcha's free tier at the same integration point. Non-intrusive
 * managed mode only.
 *
 * Implementation-time coverage verification (the brief's required first
 * step, performed 2026-10-03 against the live Supabase documentation,
 * https://supabase.com/docs/guides/auth/auth-captcha): Supabase Auth's
 * native captcha protection is documented for sign-up, password sign-in,
 * and password reset ONLY — the OTP send (`signInWithOtp`) and OTP verify
 * (`verifyOtp`) endpoints are NOT covered. The documented application-level
 * wiring therefore ships instead: the Turnstile token is verified
 * server-side here, on the OTP send path, before any provider call. The
 * hCaptcha fallback shares this integration point, so absent native
 * coverage both options are affected equally and neither is a shortcut.
 *
 * Failure posture: an unavailable or degraded CAPTCHA provider FAILS CLOSED
 * for new OTP sends while the control is enabled, with the existing generic
 * recovery state. The kill switch is the server configuration itself:
 * clearing `TURNSTILE_SECRET_KEY` disables the control at next server start
 * without a code deploy; its use is logged with identifiers and coarse
 * categories only. The operational risk is honest and documented: while the
 * provider is degraded, no new OTP can be sent.
 *
 * Staging enablement is an owner-approved gate, conditional on the restored
 * staging credentials (broken since 2026-09-29). All automated suites are
 * credential-independent: the verifier is injected and stubbed in tests.
 */

export type CaptchaConfig = {
  readonly siteKey: string;
  readonly secretKey: string;
};

export type CaptchaVerifier = (
  token: string,
  clientIp: string | null,
) => Promise<boolean>;

/** The public site key is public by nature; the secret never leaves the server. */
export function getCaptchaConfig(): CaptchaConfig | null {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!siteKey || !secretKey) return null;
  return { siteKey, secretKey };
}

/** The client-side widget script for the managed (non-intrusive) mode. */
export const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js";

type SiteverifyResponse = { success?: unknown };

/**
 * The real Cloudflare siteverify call. Response bodies are parsed for the
 * boolean verdict only — never logged. A network failure fails closed.
 */
export const realTurnstileVerifier: CaptchaVerifier = async (
  token,
  clientIp,
) => {
  const config = getCaptchaConfig();
  if (!config) return false;
  try {
    const body = new URLSearchParams({
      secret: config.secretKey,
      response: token,
    });
    if (clientIp) body.set("remoteip", clientIp);
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body, referrerPolicy: "no-referrer" },
    );
    if (!response.ok) return false;
    const verdict = (await response.json()) as SiteverifyResponse;
    return verdict.success === true;
  } catch {
    // Degraded provider: fail closed (documented posture above).
    return false;
  }
};

export type CaptchaGateArgs = {
  /** Present only when the control is enabled by configuration. */
  readonly config: CaptchaConfig | null;
  readonly verifier: CaptchaVerifier;
  readonly token: unknown;
  readonly clientIp: string | null;
};

export type CaptchaGateResult = "disabled" | "passed" | "failed";

/**
 * The OTP-send gate. `disabled` means the control is off (kill switch) and
 * delivery must proceed; `failed` means fail closed with the existing
 * generic recovery.
 */
export async function gateOtpSend(
  args: CaptchaGateArgs,
): Promise<CaptchaGateResult> {
  if (!args.config) return "disabled";
  if (typeof args.token !== "string" || args.token.length === 0) {
    return "failed";
  }
  const passed = await args.verifier(args.token, args.clientIp);
  return passed ? "passed" : "failed";
}
