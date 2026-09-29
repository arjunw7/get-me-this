/**
 * Named server-side configuration for the email-code flow (004c).
 *
 * These constants are read ONLY by server code and passed into screens as
 * props, so displayed behaviour is a server decision. The provider's
 * responses remain authoritative: the countdown is a reflection of the
 * configured limit, never the proof of it.
 */

/**
 * The resend cooldown the verify screen counts down, in seconds. It mirrors
 * the provider's configured repeat-request limit for email sends: 60
 * seconds between sends per user on the staging project's Supabase Auth
 * configuration (see docs/ops/resend-auth-delivery.md). A resend rejected
 * by the provider as too early renders the over-limit recovery state
 * whatever the countdown said, and the provider's response always wins.
 */
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Carry-cookie lifetime in seconds. It is aligned with the provider's
 * configured email-OTP expiry window (`otp_expiry` = 3600 both locally and
 * on staging) so the carried email lives exactly as long as the code it
 * accompanies. The cookie is short-lived relative to the session it may
 * create, and the browser drops it automatically at expiry.
 */
export const CARRY_COOKIE_MAX_AGE_SECONDS = 3600;

/**
 * Link-cookie lifetime in seconds (004d). The link cookie parks the emailed
 * link's token hash between the initial GET of `/auth/confirm` and the
 * explicit user verification action; its lifetime mirrors the same
 * provider-configured email-OTP expiry window (`otp_expiry` = 3600) as the
 * carry cookie, and the payload's `issuedAt` is checked against the wall
 * clock on every server-side read.
 */
export const AUTH_LINK_CARRY_MAX_AGE_SECONDS = 3600;
