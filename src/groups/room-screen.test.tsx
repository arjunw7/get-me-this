// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GroupRoomScreen } from "./room-screen";

import type { GroupRoomMember, GroupRoomSnapshot } from "./room-data";

const CALLER = "9f1d0f2e-0000-4000-8000-000000000001";
const ORGANIZER = "9f1d0f2e-0000-4000-8000-000000000002";
const OTHER = "9f1d0f2e-0000-4000-8000-000000000003";
const PENDING = "9f1d0f2e-0000-4000-8000-000000000004";

function member(
  userId: string,
  displayName: string,
  state: "joined" | "invited",
  isOrganizer: boolean,
): GroupRoomMember {
  return { userId, displayName, state, isOrganizer };
}

function fixtureRoom(
  members: readonly GroupRoomMember[],
  overrides: Partial<GroupRoomSnapshot> = {},
): GroupRoomSnapshot {
  return {
    groupId: "aa1d0f2e-0000-4000-8000-00000000abcd",
    organizerId: ORGANIZER,
    name: "Diwali Room",
    occasion: "Diwali",
    occasionAt: "2026-11-07 18:00:00",
    timeZone: "Asia/Kolkata",
    location: "Dehradun",
    description: "Lights, snacks, and one very chaotic gift exchange.",
    budgetAmountMinor: "250000",
    budgetCurrency: "INR",
    mode: "secret_draw",
    joinedMemberCount: members.filter((m) => m.state === "joined").length,
    members,
    ...overrides,
  };
}

describe("GroupRoomScreen", () => {
  it("renders the honest header hierarchy from authoritative values", () => {
    render(
      <GroupRoomScreen
        room={fixtureRoom([member(CALLER, "Riya", "joined", true)])}
        callerId={CALLER}
        today="2026-11-07"
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Diwali Room" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Draw names privately")).toBeInTheDocument();
    expect(screen.getByText("Diwali · Sat, 7 Nov, 2026")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("2500.00 INR per person")).toBeInTheDocument();
    expect(screen.getByText("Dehradun")).toBeInTheDocument();
    expect(
      screen.getByText("Lights, snacks, and one very chaotic gift exchange."),
    ).toBeInTheDocument();
  });

  it("omits null optionals and renders no countdown without a captured clock", () => {
    render(
      <GroupRoomScreen
        room={fixtureRoom([member(CALLER, "Riya", "joined", true)], {
          location: null,
          description: null,
          budgetAmountMinor: null,
          budgetCurrency: null,
        })}
        callerId={CALLER}
        today={null}
      />,
    );
    expect(screen.queryByText("Dehradun")).not.toBeInTheDocument();
    expect(screen.queryByText(/per person/)).not.toBeInTheDocument();
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
  });

  it("labels the caller, organizer, ordinary joined, and pending rows truthfully", () => {
    render(
      <GroupRoomScreen
        room={fixtureRoom([
          member(ORGANIZER, "Riya", "joined", true),
          member(OTHER, "Arjun", "joined", false),
          member(PENDING, "Meera", "invited", false),
        ])}
        callerId={OTHER}
        today="2026-11-01"
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("Organizer")).toBeInTheDocument();
    expect(within(rows[1]).getByText("You")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Invited")).toBeInTheDocument();
    expect(screen.getByText("2 joined, 1 invited")).toBeInTheDocument();
  });

  it("labels the caller-organizer row with both truths", () => {
    render(
      <GroupRoomScreen
        room={fixtureRoom([member(CALLER, "Riya", "joined", true)])}
        callerId={CALLER}
        today="2026-11-07"
      />,
    );
    expect(screen.getByText("You · Organizer")).toBeInTheDocument();
    expect(screen.getByText("1 joined")).toBeInTheDocument();
  });

  it("exposes the semantic list, the focusable region, and its description", () => {
    render(
      <GroupRoomScreen
        room={fixtureRoom([
          member(CALLER, "Riya", "joined", true),
          member(OTHER, "Arjun", "joined", false),
        ])}
        callerId={CALLER}
        today="2026-11-07"
      />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Who's in" }),
    ).toBeInTheDocument();
    const region = screen.getByRole("region", { name: "Who's in" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveAccessibleDescription(/scrolls horizontally/i);
    expect(screen.getAllByRole("list")).toHaveLength(1);
    // Initials are decorative; the adjacent text names the row.
    const avatar = within(screen.getAllByRole("listitem")[0]).getByText("R");
    expect(avatar).toHaveAttribute("aria-hidden", "true");
  });

  it("renders large rosters in full without truncating the accessible names", () => {
    const members = [
      member(CALLER, "Riya Room", "joined", true),
      ...Array.from({ length: 24 }, (_, index) =>
        member(
          `9f1d0f2e-0000-4000-8000-${`${index + 1}`.padStart(12, "0")}`,
          `Member Name ${index + 1} With A Rather Long Display Label`,
          index % 4 === 3 ? "invited" : "joined",
          false,
        ),
      ),
    ];
    render(
      <GroupRoomScreen
        room={fixtureRoom(members)}
        callerId={CALLER}
        today="2026-11-07"
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(25);
    expect(
      screen.getByText("Member Name 24 With A Rather Long Display Label"),
    ).toBeInTheDocument();
    const region = screen.getByRole("region", { name: "Who's in" });
    expect(region).toHaveClass("overflow-x-auto");
  });

  it("offers the in-room Home action and none of the forbidden controls", () => {
    render(
      <GroupRoomScreen
        room={fixtureRoom([
          member(CALLER, "Riya", "joined", true),
          member(PENDING, "Meera", "invited", false),
        ])}
        callerId={CALLER}
        today="2026-11-07"
      />,
    );
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/home",
    );

    // Honest omissions (brief 006d): no invitation, organizer, gifting,
    // wishlist, or activity surfaces may appear even as placeholders.
    const html = document.body.innerHTML;
    for (const forbidden of [
      "Copy invite link",
      "Share on WhatsApp",
      "Organizer tools",
      "Names have been drawn",
      "Create invite link",
      "Remove",
      "Leave",
      "coming soon",
    ]) {
      expect(html).not.toContain(forbidden);
    }
  });

  it("blocks autocapture and session replay for the room", () => {
    render(
      <GroupRoomScreen
        room={fixtureRoom([member(CALLER, "Riya", "joined", true)])}
        callerId={CALLER}
        today="2026-11-07"
      />,
    );
    expect(screen.getByTestId("group-room")).toHaveAttribute(
      "data-ph-no-capture",
    );
  });
});
