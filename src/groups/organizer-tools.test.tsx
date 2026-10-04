// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import { OrganizerTools } from "./organizer-tools";

import type {
  AdminAuditEntry,
  AdminLiveInvitation,
  AdminRosterMember,
} from "./member-admin-data";
import type {
  MemberAdminActionResult,
  ReinviteActionResult,
} from "./action-state";

const ORGANIZER = "9f1d0f2e-0000-4000-8000-000000000002";
const JOINED = "9f1d0f2e-0000-4000-8000-000000000003";
const INVITED = "9f1d0f2e-0000-4000-8000-000000000004";
const REMOVED = "9f1d0f2e-0000-4000-8000-000000000005";
const GROUP = "aa1d0f2e-0000-4000-8000-00000000abcd";

function rosterRow(
  userId: string,
  displayName: string,
  status: AdminRosterMember["status"],
): AdminRosterMember {
  return {
    userId,
    displayName,
    status,
    participating: status === "joined",
    joinedAt: status === "joined" ? "2026-01-01 10:00:00+00" : null,
    leftAt: null,
  };
}

const MEMBERS: readonly AdminRosterMember[] = [
  rosterRow(ORGANIZER, "Riya", "joined"),
  rosterRow(JOINED, "Aditi", "joined"),
  rosterRow(INVITED, "Dev", "invited"),
  rosterRow(REMOVED, "Sana", "removed"),
];

const LIVE: readonly AdminLiveInvitation[] = [
  {
    targetUserId: INVITED,
    invitationId: "bb1d0f2e-0000-4000-8000-00000000abcd",
    expiresAt: "2026-11-17 18:00:00+00",
  },
];

const NO_AUDIT: readonly AdminAuditEntry[] = [];

function committed(version: string): MemberAdminActionResult {
  return { ok: true, version };
}

function baseProps() {
  return {
    deleteAction: vi.fn(async () => ({ ok: true as const })),
    groupId: GROUP,
    groupName: "Diwali Room",
    organizerId: ORGANIZER,
    initialVersion: "4",
    members: MEMBERS,
    liveInvitations: LIVE,
    audit: NO_AUDIT,
    removeAction: vi.fn(async (): Promise<MemberAdminActionResult> =>
      committed("5"),
    ),
    transferAction: vi.fn(async (): Promise<MemberAdminActionResult> =>
      committed("5"),
    ),
    revokeAction: vi.fn(async (): Promise<MemberAdminActionResult> =>
      committed("5"),
    ),
    reinviteAction: vi.fn(async (): Promise<ReinviteActionResult> => ({
      ok: true,
      version: "5",
      token: "tok_abc",
      expiresAt: "2026-11-17 18:00:00+00",
    })),
  };
}

async function openTools() {
  const props = baseProps();
  render(<OrganizerTools {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /^Member tools$/ }));
  await screen.findByTestId("organizer-tools-panel");
  return props;
}

describe("OrganizerTools", () => {
  it("uses the room toolbar label while retaining the working disclosure", async () => {
    render(<OrganizerTools {...baseProps()} presentation="room" />);
    const button = screen.getByRole("button", { name: "Organizer tools" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(
      await screen.findByTestId("organizer-tools-panel"),
    ).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "true");
  });
  it("renders the disclosure closed until the organizer opens it", () => {
    render(<OrganizerTools {...baseProps()} />);
    expect(
      screen.queryByTestId("organizer-tools-panel"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Member tools" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("shows the exact roster labels and the designed empty activity state", async () => {
    await openTools();
    const rows = screen.getAllByTestId("admin-member-row");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("Riya");
    expect(rows[0]).toHaveTextContent("Organizer");
    expect(rows[1]).toHaveTextContent("Joined");
    expect(rows[2]).toHaveTextContent("Invited");
    expect(rows[3]).toHaveTextContent("Removed");
    expect(screen.getByTestId("admin-audit-empty")).toHaveTextContent(
      "No member activity yet",
    );
  });

  it("offers the brief's exact actions per row and none on the organizer's", async () => {
    await openTools();
    const rows = screen.getAllByTestId("admin-member-row");
    expect(rows[0].querySelector('[data-testid^="admin-action-"]')).toBeNull();
    // A joined member offers both Remove from group and Make organizer.
    expect(
      rows[1].querySelector('[data-testid="admin-action-remove"]'),
    ).not.toBeNull();
    expect(
      rows[1].querySelector('[data-testid="admin-action-make-organizer"]'),
    ).not.toBeNull();
    // The invited row with a live invitation: revoke, never invite-again.
    expect(
      rows[2].querySelector('[data-testid="admin-action-revoke-invite"]'),
    ).not.toBeNull();
    expect(
      rows[2].querySelector('[data-testid="admin-action-invite-again"]'),
    ).toBeNull();
    // A removed row offers Invite again only.
    expect(
      rows[3].querySelector('[data-testid="admin-action-invite-again"]'),
    ).not.toBeNull();
    expect(
      rows[3].querySelector('[data-testid="admin-action-make-organizer"]'),
    ).toBeNull();
  });

  it("removes a joined member after confirmation with the projected version", async () => {
    const props = await openTools();
    fireEvent.click(screen.getByTestId("admin-action-remove"));
    const dialog = screen.getByTestId("admin-confirm-dialog");
    expect(dialog).toHaveTextContent("Remove Aditi from the group?");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove from group" }),
    );
    await waitFor(() =>
      expect(props.removeAction).toHaveBeenCalledWith(GROUP, JOINED, "4"),
    );
    expect(props.transferAction).not.toHaveBeenCalled();
  });

  it("requires confirmation before transferring organizer control", async () => {
    const props = await openTools();
    const rows = screen.getAllByTestId("admin-member-row");
    fireEvent.click(
      rows[1].querySelector('[data-testid="admin-action-make-organizer"]')!,
    );
    const dialog = screen.getByTestId("admin-confirm-dialog");
    expect(dialog).toHaveTextContent("Make Aditi the organizer?");
    expect(dialog).toHaveTextContent(
      "You will hand over organizer control of the member list.",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Make organizer" }),
    );
    await waitFor(() =>
      expect(props.transferAction).toHaveBeenCalledWith(GROUP, JOINED, "4"),
    );
  });

  it("reveals the one-time reinvitation link only after a confirmed commit", async () => {
    const props = baseProps();
    // A declined member without a live invitation offers "Invite again".
    props.members = [
      rosterRow(ORGANIZER, "Riya", "joined"),
      rosterRow(JOINED, "Kabir", "declined"),
    ];
    props.liveInvitations = [];
    render(<OrganizerTools {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Member tools" }));
    await screen.findByTestId("organizer-tools-panel");
    expect(
      screen.queryByTestId("targeted-invite-card"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("admin-action-invite-again"));
    const dialog = screen.getByTestId("admin-confirm-dialog");
    expect(dialog).toHaveTextContent("Invite Kabir again?");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Invite again" }),
    );

    const card = await screen.findByTestId("targeted-invite-card");
    expect(card).toHaveTextContent("One-time invite link for Kabir");
    expect(card).toHaveTextContent("/invite/tok_abc");
    expect(card).toHaveTextContent("Shown only once — copy it now.");
    expect(props.reinviteAction).toHaveBeenCalledWith(GROUP, JOINED, "4");
  });

  it("surfaces the pinned stale-recovery copy and refreshes, never auto-retries", async () => {
    const props = await openTools();
    props.removeAction.mockResolvedValue({ ok: false, reason: "stale" });
    fireEvent.click(screen.getByTestId("admin-action-remove"));
    const dialog = screen.getByTestId("admin-confirm-dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove from group" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("admin-stale-note")).toHaveTextContent(
        "The member list changed. Review the current list and try again.",
      ),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("shows the honest unavailable note without roster content", async () => {
    const props = await openTools();
    props.revokeAction.mockResolvedValue({ ok: false, reason: "unavailable" });
    fireEvent.click(screen.getByTestId("admin-action-revoke-invite"));
    const dialog = screen.getByTestId("admin-confirm-dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Revoke invite" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("admin-unavailable-note")).toBeInTheDocument(),
    );
  });

  it("renders audit sentences for named and subjectless rows", async () => {
    const props = baseProps();
    props.audit = [
      {
        eventType: "member_removed",
        createdAt: "2026-02-01 09:00:00+00",
        subjectUserId: JOINED,
        subjectDisplayLabel: "Aditi",
        membershipGeneration: 1,
      },
      {
        eventType: "invitation_revoked",
        createdAt: "2026-02-02 09:00:00+00",
        subjectUserId: null,
        subjectDisplayLabel: null,
        membershipGeneration: null,
      },
    ];
    render(<OrganizerTools {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Member tools" }));
    await screen.findByTestId("organizer-tools-panel");
    const list = screen.getByTestId("admin-audit-list");
    expect(list).toHaveTextContent("Aditi was removed");
    expect(list).toHaveTextContent("An invitation was revoked");
  });
});
