import type { OnboardingErrors } from "./onboarding";

/**
 * Server-action result state for onboarding completion (004e). Lives
 * outside the "use server" module so client and server share one typed
 * surface while the action module exports only async functions.
 */
export type OnboardingSubmitState =
  | { status: "idle" }
  | { status: "error"; errors: OnboardingErrors }
  | { status: "error"; failure: "unavailable" | "update-failed" };
