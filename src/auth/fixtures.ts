/**
 * Deterministic URL-fixture values for the static auth routes (003b).
 *
 * The screens are designed states driven by URL fixtures (the prototype's
 * `?state=` / `?intent=` convention), so the Railway preview can deep-link
 * the same state as the prototype for side-by-side review. Nothing here is
 * real: no email is delivered, no code is issued, no session is created,
 * and no user input persists. These constants exist only so every state
 * renders and captures deterministically.
 *
 * Rules (mirroring src/landing/demo-data.ts):
 * - Fixed strings only; no dates, randomness, or timers beyond the
 *   countdown's deterministic initial value.
 * - Terminology: `wishlist` and `group`, never the prototype's internal
 *   nouns.
 */

export type AuthIntent = "home" | "wishlist" | "create-group";
export type VerifyVariant = "default" | "error" | "expired";
export type ConfirmVariant = "loading" | "valid" | "expired";
export type OnboardingVariant = "default" | "validation";

const INTENTS: readonly AuthIntent[] = ["home", "wishlist", "create-group"];
const VERIFY_VARIANTS: readonly VerifyVariant[] = [
  "default",
  "error",
  "expired",
];
const ONBOARDING_VARIANTS: readonly OnboardingVariant[] = [
  "default",
  "validation",
];

export function parseIntent(value: string | undefined): AuthIntent {
  return INTENTS.includes(value as AuthIntent) ? (value as AuthIntent) : "home";
}

export function parseVerifyVariant(value: string | undefined): VerifyVariant {
  return VERIFY_VARIANTS.includes(value as VerifyVariant)
    ? (value as VerifyVariant)
    : "default";
}

export function parseConfirmVariant(value: string | undefined): ConfirmVariant {
  // The bare route renders the static loading frame, matching the frozen
  // reference capture; success and recovery are explicit fixtures so the
  // final states render directly with no timer or animation gating state.
  if (value === "valid" || value === "expired") return value;
  return "loading";
}

export function parseOnboardingVariant(
  value: string | undefined,
): OnboardingVariant {
  return ONBOARDING_VARIANTS.includes(value as OnboardingVariant)
    ? (value as OnboardingVariant)
    : "default";
}

/**
 * Intent helper notes, exactly as in the frozen V18 reference
 * (pages/auth/AuthEmail.tsx). The `home` intent has no note, so the 003a
 * default rendering is unchanged.
 */
export const INTENT_NOTES: Readonly<Record<AuthIntent, string | null>> = {
  home: null,
  wishlist: "First, a quick sign-in. Then you’ll add your first item.",
  "create-group": "First, a quick sign-in. Then you’ll set up your group.",
};

/** Demo code shown in the inbox preview and prefilled into error states. */
export const DEMO_CODE = "482913";

/** Countdown initial value, rendered deterministically for capture. */
export const RESEND_SECONDS = 30;

/**
 * Taste-line suggestions from the frozen reference (pages/auth/
 * Onboarding.tsx), presented as toggle chips.
 */
export const TASTE_LINE_SUGGESTIONS = [
  "currently in my tiny-luxuries era",
  "will travel for good coffee",
  "my cart is a personality",
  "yes, I need another tote",
] as const;

export const TASTE_LINE_MAX = 60;

/** Deterministic fixture address used by the verify screen's copy. */
export const DEMO_EMAIL = "you@example.com";
