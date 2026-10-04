"use server";

import { requireCompleteProfile } from "@/src/profile/session";

import type {
  MemberAdminActionResult,
  ReinviteActionResult,
} from "./action-state";
import {
  removeGroupMember,
  reinviteGroupMember,
  revokeTargetedInvitation,
  transferGroupOrganizer,
} from "./member-admin-write";

/**
 * The organizer membership-control Server Actions (brief 006f). Every action
 * forwards the page's projected compare-and-swap version
 * (p_expected_member_admin_version); a concurrent organizer change in
 * another tab surfaces as the pinned stale-recovery copy, never as a silent
 * overwrite. The reinvite action is the only surface that ever handles a
 * one-time invitation token, and it returns it only to the initiating
 * page's component state — these actions set no cookie, write no cache, and
 * emit no analytics event (a zero-emission slice).
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalidInput(): MemberAdminActionResult {
  return { ok: false, reason: "unavailable" };
}

export async function removeGroupMemberAction(
  groupId: string,
  memberId: string,
  expectedVersion: string,
): Promise<MemberAdminActionResult> {
  await requireCompleteProfile();
  if (
    !UUID_PATTERN.test(groupId) ||
    !UUID_PATTERN.test(memberId) ||
    !/^\d+$/.test(expectedVersion)
  ) {
    return invalidInput();
  }
  const outcome = await removeGroupMember(groupId, memberId, expectedVersion);
  return mapMutation(outcome);
}

export async function transferOrganizerAction(
  groupId: string,
  memberId: string,
  expectedVersion: string,
): Promise<MemberAdminActionResult> {
  await requireCompleteProfile();
  if (
    !UUID_PATTERN.test(groupId) ||
    !UUID_PATTERN.test(memberId) ||
    !/^\d+$/.test(expectedVersion)
  ) {
    return invalidInput();
  }
  const outcome = await transferGroupOrganizer(
    groupId,
    memberId,
    expectedVersion,
  );
  return mapMutation(outcome);
}

export async function revokeInvitationAction(
  groupId: string,
  invitationId: string,
  expectedVersion: string,
): Promise<MemberAdminActionResult> {
  await requireCompleteProfile();
  if (
    !UUID_PATTERN.test(groupId) ||
    !UUID_PATTERN.test(invitationId) ||
    !/^\d+$/.test(expectedVersion)
  ) {
    return invalidInput();
  }
  const outcome = await revokeTargetedInvitation(
    groupId,
    invitationId,
    expectedVersion,
  );
  return mapMutation(outcome);
}

/**
 * Reinvitation is the only action that returns one-time token material, and
 * only to the initiating component state (006b pattern).
 */
export async function reinviteMemberAction(
  groupId: string,
  memberId: string,
  expectedVersion: string,
): Promise<ReinviteActionResult> {
  await requireCompleteProfile();
  if (
    !UUID_PATTERN.test(groupId) ||
    !UUID_PATTERN.test(memberId) ||
    !/^\d+$/.test(expectedVersion)
  ) {
    return { ok: false, reason: "unavailable" };
  }
  const outcome = await reinviteGroupMember(groupId, memberId, expectedVersion);
  if (outcome.kind === "committed") {
    return {
      ok: true,
      version: outcome.version,
      token: outcome.token,
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

function mapMutation(outcome: {
  kind: "committed" | "stale" | "unavailable" | "retry";
  version?: string;
}): MemberAdminActionResult {
  if (outcome.kind === "committed" && outcome.version) {
    return { ok: true, version: outcome.version };
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
