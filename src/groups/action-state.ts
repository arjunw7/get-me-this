import type { GroupFieldErrors } from "./validation";

/**
 * Typed action states shared by client and server (the "use server" module
 * exports only async functions; types live here).
 */

export type CreateGroupActionState =
  | { status: "idle" }
  | { status: "invalid"; errors: GroupFieldErrors }
  | {
      /** The database rejected a changed payload under the submitted key. */
      status: "conflict";
    }
  | {
      /** A safe, definite failure (no group was created). */
      status: "unavailable";
    }
  | {
      /** An ambiguous outcome: the same key and payload may be retried. */
      status: "retry";
    };

export type IssueLinkActionResult =
  | {
      ok: true;
      token: string;
      version: string;
      expiresAt: string;
    }
  | { ok: false; reason: "stale" | "unavailable" | "retry" };

export type InvitationStateActionResult =
  | {
      ok: true;
      version: string;
      state: "never_issued" | "active" | "issued_expired" | "revoked";
      expiresAt: string | null;
    }
  | { ok: false; reason: "unavailable" };
