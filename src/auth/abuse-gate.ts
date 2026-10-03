import "server-only";

import { headers } from "next/headers";

import {
  createEmailServiceClient,
  getEmailServiceConfig,
} from "@/src/email/service";
import { clientIpFor } from "@/src/rate-limit/coarse-key";
import {
  durableIncrementFromClient,
  enforceLimit,
} from "@/src/rate-limit/window-limiter";
import {
  gateOtpSend,
  getCaptchaConfig,
  realTurnstileVerifier,
} from "./captcha";
import { abuseLimitsEnabled } from "@/src/rate-limit/window-limiter";

/**
 * The auth-surface abuse gates (009b): the durable per-coarse-key limiter
 * for OTP sends and verifies, plus the Turnstile gate on new OTP sends
 * (application-level wiring — the documented coverage verification found
 * that Supabase Auth's native captcha protection does not cover the OTP
 * endpoints; see src/auth/captcha.ts).
 *
 * Every denial maps to the surface's EXISTING generic failure literal —
 * `over-limit` (the same class the provider's 429 produces, with its
 * approved recovery screen) or `unavailable` — so no timing, status, copy,
 * or header difference reveals whether an address exists.
 */

async function authDurableIncrement() {
  const config = getEmailServiceConfig();
  return durableIncrementFromClient(
    config ? createEmailServiceClient(config) : null,
  );
}

async function authCoarseSource() {
  const headerList = await headers();
  return { kind: "ip" as const, ip: clientIpFor(headerList) };
}

/**
 * The pre-send gate for one OTP send. Returns the failure literal to emit
 * (the existing generic recovery) or null to proceed.
 */
export async function gateOtpSendRequest(
  captchaToken: FormData | null,
): Promise<"over-limit" | "unavailable" | null> {
  if (!abuseLimitsEnabled()) return null;
  const source = await authCoarseSource();

  const decision = await enforceLimit({
    routeFamily: "otp_send",
    source,
    durable: await authDurableIncrement(),
  }).catch(() => ({ allowed: true }) as const);
  if (!decision.allowed) return "over-limit";

  const gate = await gateOtpSend({
    config: getCaptchaConfig(),
    verifier: realTurnstileVerifier,
    token: captchaToken?.get("captchaToken"),
    clientIp: source.ip,
  });
  if (gate === "failed") return "unavailable";
  return null;
}

/** The pre-verify gate; denial reuses the provider's own over-limit class. */
export async function gateOtpVerify(): Promise<"over-limit" | null> {
  if (!abuseLimitsEnabled()) return null;
  const decision = await enforceLimit({
    routeFamily: "otp_verify",
    source: await authCoarseSource(),
    durable: await authDurableIncrement(),
  }).catch(() => ({ allowed: true }) as const);
  if (!decision.allowed) return "over-limit";
  return null;
}
