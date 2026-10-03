// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupRoomSnapshot } from "./room-data";

const reads = vi.hoisted(() => ({
  wishlist: vi.fn(),
  friendReactions: vi.fn(),
  ownReactions: vi.fn(),
  reservations: vi.fn(),
}));
vi.mock("./member-wishlist-data", () => ({
  loadMemberWishlistSnapshot: reads.wishlist,
}));
vi.mock("./reactions/reaction-write", () => ({
  getGroupItemReactionSnapshot: reads.friendReactions,
  getOwnItemReactionSummary: reads.ownReactions,
}));
vi.mock("./gifting-items-data", () => ({
  loadGiftingItemStates: reads.reservations,
}));
vi.mock("./copy/copy-actions", () => ({ copyToMyWishlistAction: vi.fn() }));
vi.mock("./member-item-reactions", () => ({
  MemberItemReactions: () => <button>React to friend item</button>,
}));
vi.mock("./gifting-reserve-control", () => ({
  GiftingReserveControl: () => <button>Reserve this item</button>,
}));
import { RoomMemberWishlists } from "./room-wishlists";

const room = {
  occasion: "Diwali",
  occasionAt: "2026-11-07T18:00:00",
  timeZone: "Asia/Kolkata",
  location: null,
  description: null,
  budgetAmountMinor: null,
  budgetCurrency: null,
  joinedMemberCount: 2,
  groupId: "group",
  organizerId: "owner",
  name: "Friends",
  mode: "wishlist_only",
  members: [
    {
      userId: "owner",
      displayName: "Riya",
      state: "joined",
      isOrganizer: true,
    },
    {
      userId: "friend",
      displayName: "Kabir",
      state: "joined",
      isOrganizer: false,
    },
    {
      userId: "pending",
      displayName: "Mira",
      state: "invited",
      isOrganizer: false,
    },
  ],
} as GroupRoomSnapshot;
const item = {
  itemId: "item",
  title: "A useful thing",
  imageUrl: null,
  sourceUrl: null,
  retailer: null,
  note: null,
  desireLevel: "really_want",
  originalAmountMinor: null,
  originalCurrency: null,
};
const counts = { veryYou: 1, questionable: 0, wantItToo: 0 };
beforeEach(() => {
  vi.clearAllMocks();
  reads.wishlist.mockImplementation(async (_group, member) => ({
    memberDisplayName: member === "owner" ? "Riya" : "Kabir",
    items: [item],
  }));
  reads.friendReactions.mockResolvedValue([
    { itemId: "item", counts, viewerReaction: null },
  ]);
  reads.ownReactions.mockResolvedValue([{ itemId: "item", counts }]);
  reads.reservations.mockResolvedValue({ item: "unreserved" });
});
describe("RoomMemberWishlists privacy and real states", () => {
  it("loads only joined wishlists and never requests owner reservations or friend reactions", async () => {
    render(await RoomMemberWishlists({ room, callerId: "owner" }));
    expect(reads.wishlist).toHaveBeenCalledTimes(2);
    expect(reads.wishlist).not.toHaveBeenCalledWith("group", "pending");
    expect(reads.reservations).toHaveBeenCalledExactlyOnceWith(
      "group",
      "friend",
      "owner",
    );
    expect(reads.friendReactions).toHaveBeenCalledExactlyOnceWith(
      "group",
      "friend",
    );
    const owner = screen.getByRole("region", { name: "Your wishlist" });
    expect(within(owner).queryByRole("button")).not.toBeInTheDocument();
    expect(
      within(owner).getByRole("link", { name: "Edit wishlist" }),
    ).toHaveAttribute("href", "/wishlist");
    const friend = screen.getByRole("region", { name: "Kabir's wishlist" });
    expect(
      within(friend).queryByRole("button", { name: "Reserve this item" }),
    ).not.toBeInTheDocument();
    expect(
      within(friend).queryByTestId("copy-to-wishlist"),
    ).not.toBeInTheDocument();
    expect(
      within(friend).queryByRole("link", { name: /original page/ }),
    ).not.toBeInTheDocument();
    expect(
      within(friend).getByRole("button", { name: "React to friend item" }),
    ).toBeInTheDocument();
  });
  it("renders a real empty member without fake items or controls", async () => {
    reads.wishlist.mockResolvedValue({ memberDisplayName: "Kabir", items: [] });
    render(
      await RoomMemberWishlists({
        room: { ...room, members: [room.members[1]!] },
        callerId: "owner",
      }),
    );
    expect(
      screen.getByText("Kabir hasn’t added anything yet. Check back soon."),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("member-wishlist-item"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("does not render or read interaction data for a denied or stale member snapshot", async () => {
    reads.wishlist.mockResolvedValue(null);
    render(await RoomMemberWishlists({ room, callerId: "owner" }));
    expect(
      screen.queryByText(/wishlist is waiting|hasn’t added/),
    ).not.toBeInTheDocument();
    expect(reads.reservations).not.toHaveBeenCalled();
    expect(reads.friendReactions).not.toHaveBeenCalled();
    expect(reads.ownReactions).not.toHaveBeenCalled();
  });
});

describe("Room member ordering and badges", () => {
  it("puts the valid secret recipient first and the owner last", async () => {
    reads.wishlist.mockImplementation(async (_group, member) => ({
      memberDisplayName:
        member === "friend"
          ? "Kabir Kaul"
          : member === "other"
            ? "Arjun Singh"
            : "Riya",
      items: [item],
    }));
    render(
      await RoomMemberWishlists({
        room: {
          ...room,
          mode: "secret_draw",
          members: [
            room.members[0]!,
            {
              userId: "other",
              displayName: "Arjun Singh",
              state: "joined",
              isOrganizer: false,
            },
            room.members[1]!,
          ],
        },
        callerId: "owner",
        assignmentRecipientId: "friend",
      }),
    );
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Kabir's wishlistYour draw",
      "A useful thing",
      "Arjun's wishlist",
      "A useful thing",
      "Your wishlist",
      "A useful thing",
    ]);
    expect(
      screen.getByRole("link", { name: "Open gift plan" }),
    ).toHaveAttribute("href", "/groups/group/gifting");
  });
  it("does not use a recipient marker outside secret mode", async () => {
    render(
      await RoomMemberWishlists({
        room,
        callerId: "owner",
        assignmentRecipientId: "friend",
      }),
    );
    expect(screen.queryByText("Your draw")).not.toBeInTheDocument();
  });
  it.each([
    ["yours", "Reserved by you"],
    ["other", "Someone’s on it"],
  ])("shows only the friend's %s reservation badge", async (state, label) => {
    reads.reservations.mockResolvedValue({ item: state });
    render(await RoomMemberWishlists({ room, callerId: "owner" }));
    expect(
      within(
        screen.getByRole("region", { name: "Kabir's wishlist" }),
      ).getByText(label),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Your wishlist" })).queryByText(
        label,
      ),
    ).not.toBeInTheDocument();
  });
});
