/**
 * Copy for the static URL-fixture screens (003b) — the verify screen's
 * `?state=` frames, kept only for deterministic fixture capture and tests
 * (004c). Every promise the fixture interface makes must say it is a
 * static preview: the notice below labels any frame where a confirmation,
 * verification, or sign-in state could otherwise imply a real backend
 * action. The real flow's copy lives in flow-copy.ts.
 */

/**
 * The static-preview notice, shown on the fixture verify frames and the
 * static onboarding slice. The fixture frames genuinely send nothing and
 * sign nobody in, so the notice stays true of them.
 */
export const previewNotice =
  "Preview only — this static preview doesn’t send email or sign you in yet.";
