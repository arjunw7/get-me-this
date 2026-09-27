/**
 * Copy for the static email-entry screen (003a).
 *
 * The static slice sends nothing and signs nobody in, so every promise the
 * interface makes must say so. These strings are the single source for the
 * form's helper text and its post-submit notice; both are asserted by the
 * unit and e2e suites.
 */

/** Pre-submit helper under the Continue-with-email button. */
export const emailHelpText =
  "No password. This static preview doesn’t send email or sign anyone in.";

/**
 * Post-submit notice. A valid submission performs no navigation and makes
 * no claim beyond this message (a documented difference from the V18
 * reference, approved for this slice).
 */
export const previewNotice =
  "Preview only — this static preview doesn’t send email or sign you in yet.";
