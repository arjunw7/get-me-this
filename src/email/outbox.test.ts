import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  assignmentIdempotencyKey,
  buildAssignmentPayload,
  buildInvitationPayload,
  buildReminderPayload,
  invitationIdempotencyKey,
  reminderIdempotencyKey,
} from "./outbox";

/**
 * 009a payload-builder and idempotency-key unit tests: the builders mirror
 * the database allowlists exactly, and no key or payload can ever carry an
 * email address, token, or assignment identity.
 */

describe("idempotency keys", () => {
  it("invitation key composes the invitation row id with 006b's shareable_invitation_version", () => {
    expect(invitationIdempotencyKey("inv-1", "3")).toBe("invitation:inv-1:3");
    // Re-issuing rotates the key instead of replaying the old one.
    expect(invitationIdempotencyKey("inv-1", "4")).not.toBe(
      invitationIdempotencyKey("inv-1", "3"),
    );
  });

  it("assignment key is exactly the 008c assignment identity", () => {
    expect(assignmentIdempotencyKey("g1", 2, "u1")).toBe("assignment:g1:2:u1");
    // A redraw enqueues a new key for the new version.
    expect(assignmentIdempotencyKey("g1", 3, "u1")).not.toBe(
      assignmentIdempotencyKey("g1", 2, "u1"),
    );
  });

  it("reminder key includes the occasion date and offset", () => {
    expect(reminderIdempotencyKey("g1", 7, "2026-12-01")).toBe(
      "reminder:g1:7:2026-12-01",
    );
    // A rescheduled date re-keys rather than replaying or colliding.
    expect(reminderIdempotencyKey("g1", 7, "2026-12-05")).not.toBe(
      reminderIdempotencyKey("g1", 7, "2026-12-01"),
    );
  });
});

describe("payload builders", () => {
  it("invitation payload carries exactly the allowlisted preview keys and never a token", () => {
    const payload = buildInvitationPayload({
      groupId: "g1",
      groupName: "Diwali Scenes",
      occasionDate: "2026-11-08",
      hostDisplayName: "Asha",
      budgetAmountMinor: "150000",
      budgetCurrency: "INR",
      giftingMode: "secret_draw",
      joinedMemberCount: 5,
      invitationId: "inv-1",
      invitationVersion: 3,
    });
    expect(Object.keys(payload).sort()).toEqual(
      [
        "budget_amount_minor",
        "budget_currency",
        "gifting_mode",
        "group_id",
        "group_name",
        "host_display_name",
        "invitation_id",
        "invitation_version",
        "joined_member_count",
        "occasion_date",
      ].sort(),
    );
    // The builder's parameter list has no token field at all, so no caller
    // can smuggle one through.
  });

  it("assignment payload carries exactly what my_assignment shows one giver", () => {
    const payload = buildAssignmentPayload({
      groupId: "g1",
      groupName: "Crew",
      occasionDate: "2026-12-20",
      drawVersion: 2,
      recipientDisplayName: "Dev",
    });
    expect(Object.keys(payload).sort()).toEqual(
      [
        "draw_version",
        "group_id",
        "group_name",
        "occasion_date",
        "recipient_display_name",
      ].sort(),
    );
    expect(
      buildAssignmentPayload({
        groupId: "g1",
        groupName: "Crew",
        occasionDate: "2026-12-20",
        drawVersion: 2,
        recipientDisplayName: null,
      }).recipient_display_name,
    ).toBeNull();
  });

  it("reminder payload carries no per-member gifting, reservation, checklist, or assignment content", () => {
    const payload = buildReminderPayload({
      groupId: "g1",
      groupName: "Crew",
      occasionDate: "2026-12-01",
      reminderOffsetDays: 7,
    });
    expect(Object.keys(payload).sort()).toEqual(
      [
        "group_id",
        "group_name",
        "occasion_date",
        "reminder_offset_days",
      ].sort(),
    );
  });
});
