"use server";

import { requireCompleteProfile } from "@/src/profile/session";

import type {
  InvitationStateActionResult,
  IssueLinkActionResult,
} from "./action-state";
import {
  issueGroupInviteLink,
  loadOrganizerInvitationState,
} from "./group-write";

/**
 * The explicit shareable-invitation Server Actions (brief 006b). Issuance is
 * never automatic: it happens only on the organizer's click, with the
 * expected version from the projected state. The raw token is returned only
 * to the initiating page's component state — these actions set no cookie and
 * write no cache, storage, log, or analytics containing the token or the
 * complete invite URL.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function issueGroupInviteLinkAction(
  groupId: string,
  expectedVersion: string,
): Promise<IssueLinkActionResult> {
  await requireCompleteProfile();
  if (!UUID_PATTERN.test(groupId) || !/^\d+$/.test(expectedVersion)) {
    return { ok: false, reason: "unavailable" };
  }
  const outcome = await issueGroupInviteLink(groupId, expectedVersion);
  if (outcome.kind === "issued") {
    return {
      ok: true,
      token: outcome.token,
      version: outcome.version,
      expiresAt: outcome.expiresAt,
    };
  }
  return {
    ok: false,
    reason:
      outcome.kind === "stale"
        ? "stale"
        : outcome.kind === "retry"
          ? "retry"
          : "unavailable",
  };
}

/**
 * Refreshes the organizer invitation state after a stale-version response —
 * never a retry of issuance. The projection decides which honest state
 * (active-link-lost, issued-expired, or revoked) the page now shows.
 */
export async function refreshInvitationStateAction(
  groupId: string,
): Promise<InvitationStateActionResult> {
  await requireCompleteProfile();
  if (!UUID_PATTERN.test(groupId)) {
    return { ok: false, reason: "unavailable" };
  }
  const state = await loadOrganizerInvitationState(groupId);
  if (!state) return { ok: false, reason: "unavailable" };
  return {
    ok: true,
    version: state.version,
    state: state.state,
    expiresAt: state.expiresAt,
  };
}
