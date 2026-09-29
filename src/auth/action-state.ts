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
