import type { OnboardingErrors } from "./onboarding";
export type EditProfileState =
  | { status: "saved" }
  | { status: "error"; errors: OnboardingErrors }
  | {
      status: "error";
      failure: "unavailable" | "unauthenticated" | "update-failed";
    };
