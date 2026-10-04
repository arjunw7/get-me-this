// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The copy action is a "use server" module; the screen test renders the
// server component's markup only and never exercises the action.
vi.mock("./copy/copy-actions", () => ({
  copyToMyWishlistAction: vi.fn(),
}));

import { MemberWishlistScreen } from "./member-wishlist-screen";

import type { MemberWishlistItem } from "./member-wishlist-data";

const GROUP_ID = "aa1d0f2e-0000-4000-8000-00000000abcd";
const MEMBER_ID = "9f1d0f2e-0000-4000-8000-000000000002";

function item(overrides: Partial<MemberWishlistItem>): MemberWishlistItem {
  return {
    itemId: "bb1d0f2e-0000-4000-8000-000000000001",
    title: "Pour-over kettle",
    sourceUrl: "https://shop.example.invalid/kettle",
    retailer: "Fixture Roasters",
    imageUrl: "https://img.example.invalid/kettle.jpg",
    note: "The 1 litre one.",
    desireLevel: "really_want",
    originalAmountMinor: "249900",
    originalCurrency: "INR",
    ...overrides,
  };
}

describe("MemberWishlistScreen", () => {
  it("renders the member header, the sharing truth, and the back link", () => {
    render(
      <MemberWishlistScreen
        groupId={GROUP_ID}
        groupName="Diwali Room"
        memberUserId={MEMBER_ID}
        memberDisplayName="Kabir Kaul"
        items={[item({})]}
      />,
    );
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Kabir Kaul's wishlist",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You’re viewing this wishlist through your group."),
    ).toBeInTheDocument();
    const back = screen.getByRole("link", { name: /Back to Diwali Room/ });
    expect(back).toHaveAttribute("href", `/groups/${GROUP_ID}`);
  });

  it("renders populated cards in the projection's order with only authorized fields", () => {
    render(
      <MemberWishlistScreen
        groupId={GROUP_ID}
        groupName="Diwali Room"
        memberUserId={MEMBER_ID}
        memberDisplayName="Kabir Kaul"
        items={[
          item({}),
          item({
            itemId: "bb1d0f2e-0000-4000-8000-000000000002",
            title: "Mug",
            sourceUrl: null,
            retailer: null,
            imageUrl: null,
            note: null,
            desireLevel: "just_an_idea",
            originalAmountMinor: null,
            originalCurrency: null,
          }),
        ]}
      />,
    );
    const cards = screen.getAllByTestId("member-wishlist-item");
    expect(cards).toHaveLength(2);
    expect(
      within(cards[0]).getByRole("heading", { name: "Pour-over kettle" }),
    ).toBeInTheDocument();
    expect(
      within(cards[1]).getByRole("heading", { name: "Mug" }),
    ).toBeInTheDocument();
    expect(within(cards[0]).getByText("2499.00 INR")).toBeInTheDocument();
    expect(within(cards[0]).getByText("The 1 litre one.")).toBeInTheDocument();
    // The second card has neither source URL nor retailer: no price, no
    // source line separator content.
    expect(within(cards[1]).queryByText(/INR/)).not.toBeInTheDocument();
  });

  it("renders the safe external-link contract only for valid source URLs", () => {
    render(
      <MemberWishlistScreen
        groupId={GROUP_ID}
        groupName="Diwali Room"
        memberUserId={MEMBER_ID}
        memberDisplayName="Kabir Kaul"
        items={[
          item({}),
          item({
            itemId: "bb1d0f2e-0000-4000-8000-000000000002",
            title: "Mug",
            sourceUrl: null,
            retailer: null,
            imageUrl: null,
            note: null,
            desireLevel: "would_love",
            originalAmountMinor: null,
            originalCurrency: null,
          }),
        ]}
      />,
    );
    const links = screen.getAllByTestId("member-wishlist-item");
    const external = within(links[0]).getByRole("link", {
      name: /Open Pour-over kettle's original page \(opens in a new tab\)/,
    });
    expect(external).toHaveAttribute(
      "href",
      "https://shop.example.invalid/kettle",
    );
    expect(external).toHaveAttribute("target", "_blank");
    expect(external).toHaveAttribute("rel", "noopener noreferrer");
    // No source URL, no broken action.
    expect(within(links[1]).queryByRole("link")).not.toBeInTheDocument();
  });

  it("falls back to the branded placeholder for items without an image URL", () => {
    render(
      <MemberWishlistScreen
        groupId={GROUP_ID}
        groupName="Diwali Room"
        memberUserId={MEMBER_ID}
        memberDisplayName="Kabir Kaul"
        items={[item({ imageUrl: null })]}
      />,
    );
    expect(screen.getAllByTestId("wishlist-image-placeholder")).toHaveLength(1);
  });

  it("renders the honest empty state with no edit invitation", () => {
    render(
      <MemberWishlistScreen
        groupId={GROUP_ID}
        groupName="Diwali Room"
        memberUserId={MEMBER_ID}
        memberDisplayName="Kabir Kaul"
        items={[]}
      />,
    );
    expect(screen.getByTestId("member-wishlist-empty")).toBeInTheDocument();
    expect(
      screen.getByText(/has not added anything to their wishlist yet/),
    ).toBeInTheDocument();
    const html = document.body.innerHTML;
    for (const forbidden of [
      "Add an item",
      "Edit item",
      "Add to my wishlist",
    ]) {
      expect(html).not.toContain(forbidden);
    }
  });

  it("blocks autocapture and session replay for the browse surface", () => {
    render(
      <MemberWishlistScreen
        groupId={GROUP_ID}
        groupName="Diwali Room"
        memberUserId={MEMBER_ID}
        memberDisplayName="Kabir Kaul"
        items={[]}
      />,
    );
    expect(screen.getByTestId("member-wishlist")).toHaveAttribute(
      "data-ph-no-capture",
    );
  });
});

it("renders the member's persisted Vibe on the header and avatar", () => {
  render(
    <MemberWishlistScreen
      groupId={GROUP_ID}
      groupName="Friends"
      memberUserId={MEMBER_ID}
      memberDisplayName="Kabir Kaul"
      vibe="electric"
      items={[]}
    />,
  );
  const header = screen
    .getByRole("heading", { name: "Kabir Kaul's wishlist" })
    .closest("header")!;
  expect(header).toHaveClass("bg-accent-info", "text-surface-raised");
  expect(within(header).getByText("KK")).toHaveClass(
    "bg-accent-info",
    "text-surface-raised",
  );
});
