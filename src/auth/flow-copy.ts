/**
 * Copy for the real email-code flow (004c) — the single source for every
 * user-facing string of the live screens, pinned by flow-copy.test.ts.
 *
 * Copy honesty (004c): the screens promise the working code flow only.
 * They never invite use of the emailed sign-in link (its callback is not
 * complete until 004d), never claim a delivery or a sign-in that did not
 * happen, and never pass through an account-specific provider message —
 * failures map to the closed generic set below (provider-errors.ts).
 *
 * The static URL-fixture screens keep their own copy in copy.ts.
 */

/** Pre-submit helper under the Continue-with-email button. */
export const requestCodeHelpText =
  "No password. We’ll send you a secure code to sign in.";

/** Pending label while the code request is in flight. */
export const requestCodePendingText = "Sending your code…";

/** A submitted email that failed validation server-side. */
export const invalidEmailCopy =
  "That email looks a little off. Check for typos?";

/** The provider refused a send as too early (closed set). */
export const overLimitCopy =
  "That’s a few codes too fast. Wait a moment, then try again.";

/** A send that failed for delivery or another provider reason (closed set). */
export const unavailableCopy =
  "We couldn’t send your code just now. Try again in a moment.";

/** Verify screen heading and intro. */
export const verifyHeading = "Check your inbox.";

export function verifyIntroText(email: string): string {
  return `Enter the six-digit code we sent to ${email}.`;
}

/** An incomplete code, rejected before any request is made (designed copy). */
export const shortCodeCopy = "Enter all six digits.";

/**
 * A code the provider rejected — wrong, expired, reused, or superseded.
 * The provider reports one indistinguishable failure for all of these, so
 * the copy claims none of them specifically and every recovery stays open.
 */
export const rejectedCodeCopy =
  "That code didn’t work — it may have expired. Check the latest email and try again, or start a new code.";

/** A verification that failed for a non-token provider reason (closed set). */
export const verifyUnavailableCopy =
  "Something went wrong checking your code. Try again in a moment.";

/** Signed-in boundary after a successful verification. */
export const signedInHeading = "You’re in.";

export function signedInText(email: string): string {
  return `You’re signed in to Get Me This as ${email}.`;
}

export const signOutLabel = "Sign out";

/** The verify screen's controls. */
export const verifySubmitLabel = "Verify and continue";
export const resendButtonLabel = "Start a new code";
export const changeEmailLabel = "Change email";

export function resendCountdownLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const padded = String(seconds % 60).padStart(2, "0");
  return `Resend code in ${minutes}:${padded}`;
}

/** The /auth/confirm interim state: honest not-yet copy, no sign-in claim. */
export const confirmInterimHeading = "One more step.";
export const confirmInterimText =
  "This sign-in link isn’t active yet — tapping it did nothing. Your six-digit code works right now.";
export const confirmBackToCodeLabel = "Back to your code";
export const confirmChangeEmailLabel = "Use a different email";

/**
 * The /auth/link states (004d): the parked link's explicit-action choice
 * and the missing/expired/already-used recovery. Copy gets the owner's
 * side-by-side review at ARJ-23 acceptance; it promises only the explicit
 * verification action — no automatic sign-in, no claim of arrival at a
 * wishlist or group, no account-specific provider message.
 */

/** The choice state: what the parked link can do, and the alternative. */
export const linkChoiceHeading = "Finish signing in.";
export const linkChoiceText =
  "You opened your sign-in link here. Tap below to finish signing in on this device — or use your six-digit code instead.";
export const linkVerifyButtonLabel = "Use my sign-in link";
export const linkBackToCodeLabel = "Use your six-digit code instead";

/** A verification attempt the provider refused (closed generic set). */
export const linkRejectedCopy =
  "This sign-in link didn’t work — it may have expired or already been used. Request a new code to try again.";

/** The missing/expired/already-used link recovery state (no valid carry). */
export const linkRecoveryHeading = "This link didn’t work.";
export const linkRecoveryText =
  "It may have expired or already been used. Your six-digit code works right now — request a new one if you need it.";
