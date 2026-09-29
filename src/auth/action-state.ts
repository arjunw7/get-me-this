import type { RequestCodeFailure, VerifyCodeFailure } from "./provider-errors";

/**
 * Server-action result states for the email-code flow (004c). The state
 * types live here — outside the "use server" module — so client and server
 * share one typed surface while actions.ts exports only async functions.
 */

export type RequestCodeState =
  { status: "idle" } | { status: "error"; failure: RequestCodeFailure };

export type VerifyCodeState =
  | { status: "idle" }
  | { status: "verified" }
  | { status: "restart" }
  | { status: "error"; failure: VerifyCodeFailure };

export type ResendCodeState =
  | { status: "idle" }
  | { status: "resent" }
  | { status: "restart" }
  | { status: "error"; failure: RequestCodeFailure };

/**
 * The 004d magic-link verify action's states. On success the action
 * redirects to the verified screen's approved signed-in boundary (session
 * equivalence with the code path); every failure maps into the same closed
 * generic set as the code path — the completed action's route re-render
 * shows the honest recovery state. Nothing distinguishes new from
 * returning users.
 */
export type LinkVerifyState =
  { status: "idle" } | { status: "error"; failure: VerifyCodeFailure };
