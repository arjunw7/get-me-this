// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  type OwnWishlistView,
  type WishlistItemRow,
  toWishlistItemSnapshot,
  toItemView,
} from "./display";
import { VIBE_OPTIONS, vibeClasses } from "@/src/profile/vibe";
import { WishlistView } from "./wishlist-view";

const reorderAction = async () => ({ status: "recovery" as const });
const refreshAction = async () => ({ status: "recovery" as const });
const deleteAction = async () => ({ status: "unavailable" as const });

/**
 * The wishlist presentation's state selection (005b criterion 13),
 * provable without a stack: empty, populated, and the missing-wishlist
 * invariant violation that renders the error state — never a fake empty
 * state.
 */

function fixtureRow(overrides: Partial<WishlistItemRow> = {}): WishlistItemRow {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    title: "Ceramic pour-over coffee set",
    source_url: "https://example.invalid/products/pour-over-set",
    retailer: "Fixture Roasters",
    image_url: null,
    image_snapshot_path: null,
    note: "The matte one, not the glossy one.",
    desire_level: "really_want",
    sort_position: 1,
    original_amount_minor: "249900",
    original_currency: "INR",
    converted_amount_minor: null,
    converted_currency: null,
    conversion_rate_source: null,
    conversion_rate_at: null,
    created_at: "2026-09-30T00:00:00.000Z",
    updated_at: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

// The view consumes client-safe item views (005f): the server resolves
// image sources and strips raw snapshot paths before anything crosses into
// a client component.
function snapshot(row: WishlistItemRow) {
  return toItemView(toWishlistItemSnapshot(row), null);
}

const EMPTY_WISHLIST: OwnWishlistView = { wishlistId: "w-1", items: [] };

function viewProps(wishlist: OwnWishlistView | null) {
  return {
    displayName: "Ada",
    tasteLine: "currently in my tiny-luxuries era",
    wishlist,
    reorderAction,
    refreshAction,
    deleteAction,
  };
}

describe("WishlistView state selection", () => {
  it.each(VIBE_OPTIONS)("renders the saved $label Vibe", ({ value, label }) => {
    const { container } = render(
      <WishlistView {...viewProps(EMPTY_WISHLIST)} vibe={value} />,
    );
    expect(container.querySelector(`[data-vibe="${value}"]`)).toHaveClass(
      ...vibeClasses(value).split(" "),
    );
    expect(screen.getByText(new RegExp(`${label} vibe`))).toBeVisible();
  });
  it("renders the V18 empty composition for zero items", () => {
    render(<WishlistView {...viewProps(EMPTY_WISHLIST)} />);

    expect(
      screen.getByRole("heading", { name: "Very minimalist of you." }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Add the first thing you'd secretly love to unwrap. A candle, a camera, the hoodie you keep looking at.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByText(/Your friends will take it from there/),
    ).toBeNull();
    // The profile region is named for the owner; viewport-specific heading
    // visibility is checked by the real-browser geometry suite.
    expect(screen.getByRole("region", { name: "Ada" })).toBeVisible();
    expect(screen.getByText("currently in my tiny-luxuries era")).toBeVisible();
    expect(screen.getByText("0 things")).toBeVisible();
  });

  it("labels the empty-state CTA exactly 'Add an item' pointing at /wishlist/items/new", () => {
    render(<WishlistView {...viewProps(EMPTY_WISHLIST)} />);

    const cta = screen.getByRole("link", { name: "Add an item" });
    expect(cta).toBeVisible();
    expect(cta).toHaveAttribute("href", "/wishlist/items/new");
  });

  it("never implies public visibility on the empty state", () => {
    const { container } = render(
      <WishlistView {...viewProps(EMPTY_WISHLIST)} />,
    );

    const text = container.textContent?.toLowerCase() ?? "";
    expect(text).not.toContain("share");
    expect(text).not.toContain("visible to");
    expect(text).not.toContain("group");
  });

  it("renders no fake items on the empty state", () => {
    render(<WishlistView {...viewProps(EMPTY_WISHLIST)} />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });

  it("renders the populated view from saved item snapshots in read order", () => {
    const wishlist: OwnWishlistView = {
      wishlistId: "w-1",
      items: [
        snapshot(fixtureRow()),
        snapshot(
          fixtureRow({
            id: "00000000-0000-4000-8000-000000000003",
            title: "The Overstory paperback",
            source_url: null,
            retailer: "Fixture Books",
            note: null,
            desire_level: "would_love",
            sort_position: 2,
            original_amount_minor: "132000",
            original_currency: "JPY",
          }),
        ),
      ],
    };
    render(<WishlistView {...viewProps(wishlist)} />);

    expect(screen.getByText("2 things")).toBeVisible();
    expect(screen.getByRole("link", { name: "Add an item" })).toHaveAttribute(
      "href",
      "/wishlist/items/new",
    );
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(2);
    // Pinned read order (sort_position ASC, id ASC — preserved by data.ts).
    const titles = cards.map(
      (card) => within(card).getByRole("heading").textContent,
    );
    expect(titles).toEqual([
      "Ceramic pour-over coffee set",
      "The Overstory paperback",
    ]);
    expect(screen.getByRole("button", { name: "Reorder" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("renders only closed success-marker copy", () => {
    const wishlist: OwnWishlistView = { wishlistId: "w-1", items: [] };
    const { rerender } = render(
      <WishlistView {...viewProps(wishlist)} notice="added" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Item added to your wishlist.",
    );
    rerender(<WishlistView {...viewProps(wishlist)} notice={null} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders the designed error state for the missing-wishlist invariant violation, never the empty state", () => {
    render(<WishlistView {...viewProps(null)} />);

    expect(
      screen.getByRole("heading", { name: "Something went wrong." }),
    ).toBeVisible();
    expect(
      screen.getByText(/Your wishlist couldn’t be loaded just now/),
    ).toBeVisible();
    // The retry affordance is present; no empty-state copy, no raw detail.
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/wishlist",
    );
    expect(
      screen.queryByRole("heading", { name: "Very minimalist of you." }),
    ).not.toBeInTheDocument();
    const text = screen.getByRole("main").textContent ?? "";
    expect(text).not.toMatch(/error|exception|stack/i);
  });
});
