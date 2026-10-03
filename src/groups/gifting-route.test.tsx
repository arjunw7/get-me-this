// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  room: vi.fn(),
  assignment: vi.fn(),
  checklist: vi.fn(),
  wishlist: vi.fn(),
  states: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/src/profile/session", () => ({
  requireCompleteProfile: async () => ({
    userId: "viewer",
    email: null,
    profile: { displayName: "Viewer", tasteLine: null },
  }),
}));
vi.mock("@/src/auth/analytics-identity", () => ({
  AnalyticsIdentity: () => null,
}));
vi.mock("@/src/wishlist/wishlist-shell-header", () => ({
  WishlistShellHeader: () => null,
}));
vi.mock("@/src/groups/room-data", () => ({
  loadGroupRoomSnapshot: mocks.room,
}));
vi.mock("@/src/groups/assignment-data", () => ({
  loadMyAssignment: mocks.assignment,
}));
vi.mock("@/src/groups/gifting", () => ({
  loadGiftChecklist: mocks.checklist,
  isGroupIdFormat: () => true,
}));
vi.mock("@/src/groups/member-wishlist-data", () => ({
  loadMemberWishlistSnapshot: mocks.wishlist,
}));
vi.mock("@/src/groups/gifting-items-data", () => ({
  loadGiftingItemStates: mocks.states,
}));
vi.mock("@/src/groups/gifting-actions", () => ({
  setGiftEntryStatusAction: vi.fn(),
}));
vi.mock("@/src/groups/gifting-product-grid", () => ({
  GiftingProductGrid: () => <p>Authorized gift ideas</p>,
}));
import GiftingPage from "../../app/groups/[groupId]/gifting/page";
const room = {
  groupId: "group",
  name: "Friends",
  mode: "gift_everyone",
  budgetAmountMinor: "250000",
  budgetCurrency: "INR",
  members: [
    { userId: "viewer", state: "joined" },
    { userId: "friend", state: "joined" },
  ],
};
const props = {
  params: Promise.resolve({ groupId: "group" }),
  searchParams: Promise.resolve({}),
};
describe("authorized gifting routes", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.room.mockResolvedValue(room);
    mocks.states.mockResolvedValue({});
    mocks.wishlist.mockResolvedValue({
      memberDisplayName: "Friend",
      items: [],
    });
  });
  it("stops denied room requests before every private read", async () => {
    mocks.room.mockResolvedValue(null);
    await expect(GiftingPage(props)).rejects.toThrow("NOT_FOUND");
    expect(mocks.assignment).not.toHaveBeenCalled();
    expect(mocks.checklist).not.toHaveBeenCalled();
    expect(mocks.wishlist).not.toHaveBeenCalled();
  });
  it("shows browse mode with no assignment or checklist reads", async () => {
    mocks.room.mockResolvedValue({ ...room, mode: "wishlist_only" });
    render(await GiftingPage(props));
    expect(
      screen.getByRole("heading", { name: "No assignments in this group." }),
    ).toBeTruthy();
    expect(mocks.assignment).not.toHaveBeenCalled();
    expect(mocks.checklist).not.toHaveBeenCalled();
  });
  it("links browse gifting to the room's wishlist section", async () => {
    mocks.room.mockResolvedValue({ ...room, mode: "wishlist_only" });
    render(await GiftingPage(props));
    expect(
      screen.getByRole("link", { name: "Browse wishlists" }),
    ).toHaveAttribute("href", "/groups/group#wishlists");
  });
  it("keeps long recipient names accessible while showing a compact first-name heading", async () => {
    const fullName = "Kabir Krishnamurthy Narayanan";
    mocks.room.mockResolvedValue({ ...room, mode: "secret_draw" });
    mocks.assignment.mockResolvedValue({
      isValid: true,
      recipientId: "friend",
      recipientDisplayName: fullName,
    });
    render(await GiftingPage(props));
    const heading = screen.getByRole("heading", {
      name: `You got ${fullName}`,
    });
    expect(heading).toHaveTextContent("You gotKabir");
    expect(heading).not.toHaveTextContent("Krishnamurthy");
    expect(mocks.wishlist).toHaveBeenCalledExactlyOnceWith("group", "friend");
  });
  it("renders only the caller's valid secret assignment recipient", async () => {
    mocks.room.mockResolvedValue({ ...room, mode: "secret_draw" });
    mocks.assignment.mockResolvedValue({
      isValid: true,
      recipientId: "friend",
      recipientDisplayName: "Friend",
    });
    render(await GiftingPage(props));
    expect(
      screen.getByRole("heading", { name: /You got Friend/ }),
    ).toBeTruthy();
    expect(mocks.wishlist).toHaveBeenCalledWith("group", "friend");
    expect(mocks.checklist).not.toHaveBeenCalled();
  });
  it("hides stale secret recipient identities and never loads their items", async () => {
    mocks.room.mockResolvedValue({ ...room, mode: "secret_draw" });
    mocks.assignment.mockResolvedValue({
      isValid: false,
      recipientId: "old-friend",
      recipientDisplayName: "Hidden Person",
    });
    render(await GiftingPage(props));
    expect(screen.queryByText("Hidden Person")).toBeNull();
    expect(mocks.wishlist).not.toHaveBeenCalled();
    expect(mocks.states).not.toHaveBeenCalled();
  });
  it("refuses an unavailable checklist instead of presenting false zero progress", async () => {
    mocks.checklist.mockResolvedValue([]);
    await expect(GiftingPage(props)).rejects.toThrow("NOT_FOUND");
  });
});
