import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  parseGroupAdminAudit,
  parseGroupAdminLiveInvitations,
  parseGroupAdminMembers,
} from "./member-admin-data";

const ORGANIZER = "9f1d0f2e-0000-4000-8000-000000000002";
const CALLER = ORGANIZER;
const JOINED = "9f1d0f2e-0000-4000-8000-000000000003";
const INVITED = "9f1d0f2e-0000-4000-8000-000000000004";
const DECLINED = "9f1d0f2e-0000-4000-8000-000000000005";

function rosterRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: JOINED,
    display_name: "Aditi",
    status: "joined",
    participating: true,
    joined_at: "2026-01-01 10:00:00+00",
    left_at: null,
    ...overrides,
  };
}

describe("parseGroupAdminMembers", () => {
  it("parses the full roster across every membership state", () => {
    const members = parseGroupAdminMembers(
      [
        rosterRow({ user_id: ORGANIZER, display_name: "Riya" }),
        rosterRow({ user_id: JOINED }),
        rosterRow({
          user_id: INVITED,
          display_name: "Dev",
          status: "invited",
          participating: false,
          joined_at: null,
        }),
        rosterRow({
          user_id: DECLINED,
          display_name: "Kabir",
          status: "declined",
          participating: false,
          joined_at: null,
        }),
        rosterRow({
          user_id: "9f1d0f2e-0000-4000-8000-000000000006",
          display_name: "Sana",
          status: "removed",
          participating: false,
          joined_at: null,
          left_at: "2026-02-01 09:00:00+00",
        }),
      ],
      ORGANIZER,
      CALLER,
    );
    expect(members).toHaveLength(5);
    expect(members?.[0]).toMatchObject({
      userId: ORGANIZER,
      status: "joined",
      participating: true,
    });
    expect(members?.[3]).toMatchObject({ status: "declined" });
  });

  it("returns null for an empty roster", () => {
    expect(parseGroupAdminMembers([], ORGANIZER, CALLER)).toBeNull();
    expect(parseGroupAdminMembers(null, ORGANIZER, CALLER)).toBeNull();
  });

  it("fails closed when the caller is not the organizer", () => {
    expect(
      parseGroupAdminMembers(
        [rosterRow({ user_id: ORGANIZER }), rosterRow({ user_id: JOINED })],
        ORGANIZER,
        JOINED,
      ),
    ).toBeNull();
  });

  it("fails closed on a missing or duplicated organizer row", () => {
    expect(parseGroupAdminMembers([rosterRow()], ORGANIZER, CALLER)).toBeNull();
    expect(
      parseGroupAdminMembers(
        [
          rosterRow({ user_id: ORGANIZER }),
          rosterRow({ user_id: ORGANIZER, display_name: "Riya 2" }),
          rosterRow(),
        ],
        ORGANIZER,
        CALLER,
      ),
    ).toBeNull();
  });

  it("fails closed on a former-state organizer row", () => {
    expect(
      parseGroupAdminMembers(
        [
          rosterRow({
            user_id: ORGANIZER,
            status: "removed",
            participating: false,
          }),
          rosterRow(),
        ],
        ORGANIZER,
        CALLER,
      ),
    ).toBeNull();
  });

  it("fails closed on duplicate member ids or an unknown status", () => {
    expect(
      parseGroupAdminMembers(
        [rosterRow({ user_id: ORGANIZER }), rosterRow(), rosterRow()],
        ORGANIZER,
        CALLER,
      ),
    ).toBeNull();
    expect(
      parseGroupAdminMembers(
        [rosterRow({ user_id: ORGANIZER }), rosterRow({ status: "banned" })],
        ORGANIZER,
        CALLER,
      ),
    ).toBeNull();
  });

  it("fails closed on a non-boolean participating flag", () => {
    expect(
      parseGroupAdminMembers(
        [rosterRow({ user_id: ORGANIZER }), rosterRow({ participating: 1 })],
        ORGANIZER,
        CALLER,
      ),
    ).toBeNull();
  });
});

describe("parseGroupAdminAudit", () => {
  it("parses named and subjectless entries", () => {
    const entries = parseGroupAdminAudit([
      {
        event_type: "member_removed",
        created_at: "2026-02-01 09:00:00+00",
        subject_user_id: JOINED,
        subject_display_label: "Aditi",
        membership_generation: 1,
      },
      {
        event_type: "invitation_revoked",
        created_at: "2026-02-02 09:00:00+00",
        subject_user_id: null,
        subject_display_label: null,
        membership_generation: null,
      },
    ]);
    expect(entries).toHaveLength(2);
    expect(entries?.[0]).toMatchObject({
      eventType: "member_removed",
      subjectDisplayLabel: "Aditi",
    });
    expect(entries?.[1]?.subjectDisplayLabel).toBeNull();
  });

  it("accepts an empty feed and rejects unknown event types", () => {
    expect(parseGroupAdminAudit([])).toEqual([]);
    expect(
      parseGroupAdminAudit([
        {
          event_type: "wish_cursed",
          created_at: "2026-02-01 09:00:00+00",
          subject_user_id: JOINED,
          subject_display_label: "Aditi",
          membership_generation: 1,
        },
      ]),
    ).toBeNull();
  });

  it("rejects a malformed row shape", () => {
    expect(
      parseGroupAdminAudit([
        {
          event_type: "member_removed",
          created_at: "",
          subject_user_id: JOINED,
          subject_display_label: "Aditi",
          membership_generation: 1,
        },
      ]),
    ).toBeNull();
    expect(
      parseGroupAdminAudit([
        {
          event_type: "member_removed",
          created_at: "2026-02-01 09:00:00+00",
          subject_user_id: "not-a-uuid",
          subject_display_label: "Aditi",
          membership_generation: 1,
        },
      ]),
    ).toBeNull();
    expect(
      parseGroupAdminAudit([
        {
          event_type: "member_removed",
          created_at: "2026-02-01 09:00:00+00",
          subject_user_id: JOINED,
          subject_display_label: "Aditi",
          membership_generation: -1,
        },
      ]),
    ).toBeNull();
  });
});

describe("parseGroupAdminLiveInvitations", () => {
  it("parses a live invitation without token material", () => {
    const invitations = parseGroupAdminLiveInvitations([
      {
        target_user_id: INVITED,
        invitation_id: "aa1d0f2e-0000-4000-8000-00000000abcd",
        expires_at: "2026-11-17 18:00:00+00",
      },
    ]);
    expect(invitations).toHaveLength(1);
    expect(invitations?.[0]).toMatchObject({ targetUserId: INVITED });
    expect(JSON.stringify(invitations)).not.toContain("token");
  });

  it("rejects duplicate live invitations for one target", () => {
    expect(
      parseGroupAdminLiveInvitations([
        {
          target_user_id: INVITED,
          invitation_id: "aa1d0f2e-0000-4000-8000-00000000abcd",
          expires_at: "2026-11-17 18:00:00+00",
        },
        {
          target_user_id: INVITED,
          invitation_id: "aa1d0f2e-0000-4000-8000-00000000abce",
          expires_at: "2026-11-17 18:00:00+00",
        },
      ]),
    ).toBeNull();
  });

  it("rejects malformed rows", () => {
    expect(
      parseGroupAdminLiveInvitations([
        {
          target_user_id: INVITED,
          invitation_id: "nope",
          expires_at: "2026-11-17 18:00:00+00",
        },
      ]),
    ).toBeNull();
    expect(parseGroupAdminLiveInvitations(null)).toBeNull();
  });
});
