import { describe, expect, it } from "vitest";

import {
  ADMIN_AUDIT_EMPTY_TEXT,
  adminAuditText,
  adminStatusLabel,
  memberAdminActions,
  targetedInviteLink,
} from "./member-admin-view";

import type { AdminAuditEntry, AdminRosterMember } from "./member-admin-data";

const ORGANIZER = "9f1d0f2e-0000-4000-8000-000000000002";
const JOINED = "9f1d0f2e-0000-4000-8000-000000000003";
const INVITED = "9f1d0f2e-0000-4000-8000-000000000004";

function member(
  userId: string,
  status: AdminRosterMember["status"],
): AdminRosterMember {
  return {
    userId,
    displayName: "Member",
    status,
    participating: status === "joined",
    joinedAt: status === "joined" ? "2026-01-01 10:00:00+00" : null,
    leftAt: null,
  };
}

describe("memberAdminActions", () => {
  it("maps each status per the brief's exact table", () => {
    expect(
      memberAdminActions(member(JOINED, "joined"), ORGANIZER, undefined),
    ).toEqual(["remove", "make-organizer"]);
    expect(
      memberAdminActions(member(INVITED, "invited"), ORGANIZER, undefined),
    ).toEqual(["invite-again"]);
    expect(
      memberAdminActions(member(INVITED, "declined"), ORGANIZER, undefined),
    ).toEqual(["invite-again"]);
    expect(
      memberAdminActions(member(INVITED, "left"), ORGANIZER, undefined),
    ).toEqual(["invite-again"]);
    expect(
      memberAdminActions(member(INVITED, "removed"), ORGANIZER, undefined),
    ).toEqual(["invite-again"]);
  });

  it("prefers the live invitation: revoke over invite-again", () => {
    expect(
      memberAdminActions(member(INVITED, "invited"), ORGANIZER, {
        targetUserId: INVITED,
      }),
    ).toEqual(["revoke-invite"]);
  });

  it("offers nothing on the organizer's own row", () => {
    expect(
      memberAdminActions(member(ORGANIZER, "joined"), ORGANIZER, undefined),
    ).toEqual([]);
  });
});

describe("adminStatusLabel", () => {
  it("renders the exact roster labels", () => {
    expect(adminStatusLabel(member(ORGANIZER, "joined"), ORGANIZER)).toBe(
      "Organizer",
    );
    expect(adminStatusLabel(member(JOINED, "joined"), ORGANIZER)).toBe(
      "Joined",
    );
    expect(adminStatusLabel(member(JOINED, "invited"), ORGANIZER)).toBe(
      "Invited",
    );
    expect(adminStatusLabel(member(JOINED, "declined"), ORGANIZER)).toBe(
      "Declined",
    );
    expect(adminStatusLabel(member(JOINED, "left"), ORGANIZER)).toBe("Left");
    expect(adminStatusLabel(member(JOINED, "removed"), ORGANIZER)).toBe(
      "Removed",
    );
  });
});

describe("adminAuditText", () => {
  function entry(
    eventType: AdminAuditEntry["eventType"],
    label: string | null,
  ): AdminAuditEntry {
    return {
      eventType,
      createdAt: "2026-02-01 09:00:00+00",
      subjectUserId: label === null ? null : JOINED,
      subjectDisplayLabel: label,
      membershipGeneration: 1,
    };
  }

  it("renders one pinned sentence per event", () => {
    expect(adminAuditText(entry("member_removed", "Aditi"))).toBe(
      "Aditi was removed",
    );
    expect(adminAuditText(entry("organizer_transferred", "Aditi"))).toBe(
      "Aditi became the organizer",
    );
    expect(adminAuditText(entry("member_reinvited", "Aditi"))).toBe(
      "Aditi was re-invited",
    );
  });

  it("omits the name for a subjectless revocation row", () => {
    expect(adminAuditText(entry("invitation_revoked", null))).toBe(
      "An invitation was revoked",
    );
  });

  it("exposes the designed empty-state copy", () => {
    expect(ADMIN_AUDIT_EMPTY_TEXT).toContain("No member activity yet");
  });
});

describe("targetedInviteLink", () => {
  it("uses the opaque token route, server and client alike", () => {
    expect(targetedInviteLink("tok", null)).toBe("/invite/tok");
    expect(targetedInviteLink("tok", "https://getmethis.example")).toBe(
      "https://getmethis.example/invite/tok",
    );
  });
});
