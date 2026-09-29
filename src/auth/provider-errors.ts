/**
 * Closed generic mapping from provider failures to public states (004c).
 *
 * The provider's raw error message never reaches the interface: every
 * failure is mapped into one of the closed enums below, and the public
 * response carries no distinction between new and returning users — the
 * mapping never sees account data and never branches on it. Empirically
 * (verified against the local stack, and the same failure family applies to
 * staging): a rejected, expired, reused, or superseded code all arrive as
 * the same 403 `otp_expired`, and a too-early send arrives as a 429
 * `over_*rate_limit`.
 */

export type RequestCodeFailure = "invalid-email" | "over-limit" | "unavailable";

export type VerifyCodeFailure =
  "invalid-code" | "rejected-code" | "over-limit" | "unavailable";

type ProviderErrorShape = {
  status?: number;
  code?: string;
};

/** Narrows an unknown thrown value to the provider error's public shape. */
function providerError(error: unknown): ProviderErrorShape | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as { status?: unknown; code?: unknown };
  const status =
    typeof candidate.status === "number" ? candidate.status : undefined;
  const code = typeof candidate.code === "string" ? candidate.code : undefined;
  if (status === undefined && code === undefined) return null;
  return { status, code };
}

/** True for any provider refusal that means "too many requests, wait". */
export function isOverLimitFailure(error: unknown): boolean {
  const provider = providerError(error);
  if (!provider) return false;
  if (provider.status === 429) return true;
  return (
    typeof provider.code === "string" &&
    /^over_.*rate_limit$/.test(provider.code)
  );
}

export function mapRequestCodeFailure(error: unknown): RequestCodeFailure {
  if (isOverLimitFailure(error)) return "over-limit";
  // Everything else — delivery failure, network failure, unexpected provider
  // response — lands in one generic recovery state.
  return "unavailable";
}

export function mapVerifyCodeFailure(error: unknown): VerifyCodeFailure {
  if (isOverLimitFailure(error)) return "over-limit";
  const provider = providerError(error);
  if (provider?.status === 403 || provider?.code === "otp_expired") {
    // One provider failure covers wrong, expired, reused, and superseded
    // codes; the public state is the same approved recovery for all.
    return "rejected-code";
  }
  if (
    typeof provider?.status === "number" &&
    provider.status >= 400 &&
    provider.status < 500
  ) {
    // Any other 4xx from verifyOtp is a token-shaped refusal (bad or
    // malformed code), not a provider outage — recover by retrying the
    // code, not by treating the flow as unavailable.
    return "rejected-code";
  }
  return "unavailable";
}
