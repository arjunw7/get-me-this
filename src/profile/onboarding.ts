import { isBlank } from "./blank";
import { TASTE_LINE_MAX } from "@/src/auth/fixtures";

/**
 * Pure onboarding validation (004e), shared by the server action (the
 * authoritative check, re-run on every submit) and the client form (the
 * instant convenience check). The database CHECK constraints and
 * blank-to-null trigger remain the primary controls for direct writes.
 *
 * Rules, all derived from the one shared blankness rule (blank.ts):
 * - display name is required: blank values (null handled by callers) are
 *   rejected with the designed error, never stored;
 * - taste line is optional: blank values normalize to null — empty and
 *   never-provided are indistinguishable downstream;
 * - a taste line over the approved 60-character limit is REJECTED, never
 *   silently truncated;
 * - non-blank values are stored exactly as provided — nothing trims,
 *   rewrites, or otherwise normalizes them.
 */

/** The display-name bound enforced by the form and mirrored server-side. */
export const DISPLAY_NAME_MAX = 40;

export type OnboardingErrors = {
  readonly vibe?: "invalid";
  readonly displayName?: "required" | "too-long";
  readonly tasteLine?: "too-long";
};

export type ValidOnboardingInput = {
  readonly ok: true;
  readonly displayName: string;
  readonly tasteLine: string | null;
};

export type InvalidOnboardingInput = {
  readonly ok: false;
  readonly errors: OnboardingErrors;
};

export type OnboardingValidationResult =
  ValidOnboardingInput | InvalidOnboardingInput;

export function validateOnboardingInput(
  displayName: string,
  tasteLine: string,
): OnboardingValidationResult {
  let displayNameError: OnboardingErrors["displayName"];
  let tasteLineError: OnboardingErrors["tasteLine"];

  if (isBlank(displayName)) {
    displayNameError = "required";
  } else if (displayName.length > DISPLAY_NAME_MAX) {
    displayNameError = "too-long";
  }

  let normalizedTasteLine: string | null = null;
  if (!isBlank(tasteLine)) {
    if (tasteLine.length > TASTE_LINE_MAX) {
      tasteLineError = "too-long";
    } else {
      normalizedTasteLine = tasteLine;
    }
  }

  if (displayNameError || tasteLineError) {
    return {
      ok: false,
      errors: {
        ...(displayNameError ? { displayName: displayNameError } : {}),
        ...(tasteLineError ? { tasteLine: tasteLineError } : {}),
      },
    };
  }
  return { ok: true, displayName, tasteLine: normalizedTasteLine };
}
