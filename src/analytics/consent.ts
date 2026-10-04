/** Browser-scoped, optional analytics consent. Never an authorization cookie. */
export const ANALYTICS_CONSENT_COOKIE = "gmt_analytics_consent";
export const ANALYTICS_CONSENT_MAX_AGE = 180 * 24 * 60 * 60;
export const ANALYTICS_CONSENT_CHANGED = "gmt:analytics:consent-changed";
export type AnalyticsConsentChoice = "granted" | "denied";
export type AnalyticsConsent = AnalyticsConsentChoice | "pending";

export function readConsentCookie(cookie: string): AnalyticsConsent {
  const value = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ANALYTICS_CONSENT_COOKIE}=`))
    ?.slice(ANALYTICS_CONSENT_COOKIE.length + 1);
  return value === "granted" || value === "denied" ? value : "pending";
}
