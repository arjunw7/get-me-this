// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { WishlistItemSnapshot } from "./display";
import { WishlistCard, WishlistCardGrid } from "./wishlist-card";

/**
 * The wishlist card (005b): snapshot-field rendering, the branded
 * missing-image placeholder (including the runtime image-failure
 * fallback), and the linked/unlinked retailer presentation.
 */

function item(
  overrides: Partial<WishlistItemSnapshot> = {},
): WishlistItemSnapshot {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    title: "Ceramic pour-over coffee set",
    sourceUrl: "https://example.invalid/products/pour-over-set",
    retailer: "Fixture Roasters",
    imageUrl: null,
    imageSnapshotPath: null,
    note: "The matte one, not the glossy one.",
    desireLevel: "really_want",
    sortPosition: 1,
    originalAmountMinor: "249900",
    originalCurrency: "INR",
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("WishlistCard", () => {
  it("renders the title, linked retailer, pinned money format, note, and desire chip", () => {
    render(<WishlistCard item={item()} index={0} />);

    expect(
      within(screen.getByRole("article")).getByRole("heading", {
        name: "Ceramic pour-over coffee set",
      }),
    ).toBeVisible();
    const link = screen.getByRole("link", { name: "Fixture Roasters" });
    expect(link).toHaveAttribute(
      "href",
      "https://example.invalid/products/pour-over-set",
    );
    expect(link).toHaveAttribute("rel", "noreferrer");
    // The pinned minor-unit money format: 249900 minor INR = 2499.00 INR.
    expect(screen.getByText("2499.00 INR")).toBeVisible();
    expect(
      screen.getByText("The matte one, not the glossy one."),
    ).toBeVisible();
    expect(screen.getByText("Really want")).toBeVisible();
  });

  it("renders an unlinked retailer (no source URL) as plain text", () => {
    render(
      <WishlistCard
        item={item({ sourceUrl: null, desireLevel: "would_love" })}
        index={0}
      />,
    );

    expect(screen.getByText("Fixture Roasters")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Fixture Roasters" })).toBeNull();
    expect(screen.getByText("Would love")).toBeVisible();
  });

  it("keeps a source link when retailer metadata is absent", () => {
    render(<WishlistCard item={item({ retailer: null })} index={0} />);
    const link = screen.getByRole("link", { name: "example.invalid" });
    expect(link).toHaveAttribute(
      "href",
      "https://example.invalid/products/pour-over-set",
    );
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("uses a safe generic label for an unparseable source URL", () => {
    render(
      <WishlistCard
        item={item({ sourceUrl: "bad-url", retailer: null })}
        index={0}
      />,
    );
    expect(screen.getByRole("link", { name: "Source link" })).toHaveAttribute(
      "href",
      "bad-url",
    );
  });

  it("omits the money text entirely for items with no stored price", () => {
    render(
      <WishlistCard
        item={item({
          originalAmountMinor: null,
          originalCurrency: null,
          retailer: null,
          sourceUrl: null,
        })}
        index={0}
      />,
    );

    expect(screen.queryByText(/INR/)).toBeNull();
  });

  it("renders the branded placeholder for items with no image URL — never a broken image", () => {
    render(<WishlistCard item={item()} index={0} />);

    expect(screen.getByTestId("wishlist-image-placeholder")).toBeVisible();
    expect(
      within(screen.getByTestId("wishlist-image-placeholder")).getByText(
        "Ceramic pour-over coffee set",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("prefers the image URL over the snapshot path in this slice", () => {
    render(
      <WishlistCard
        item={item({
          imageUrl: "https://example.invalid/images/pour-over.jpg",
          imageSnapshotPath: "wishlist-items/snapshot.jpg",
        })}
        index={0}
      />,
    );

    const image = screen.getByRole("img", {
      name: "Ceramic pour-over coffee set",
    });
    expect(image).toHaveAttribute(
      "src",
      "https://example.invalid/images/pour-over.jpg",
    );
    expect(screen.queryByTestId("wishlist-image-placeholder")).toBeNull();
  });

  it("renders the placeholder for a snapshot-path-only item (no Storage resolution until 005e/005f)", () => {
    render(
      <WishlistCard
        item={item({ imageSnapshotPath: "wishlist-items/snapshot.jpg" })}
        index={0}
      />,
    );

    expect(screen.getByTestId("wishlist-image-placeholder")).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("degrades a runtime image failure to the branded placeholder", () => {
    render(
      <WishlistCard
        item={item({ imageUrl: "http://127.0.0.1:59999/broken.jpg" })}
        index={0}
      />,
    );

    const image = screen.getByRole("img", {
      name: "Ceramic pour-over coffee set",
    });
    fireEvent.error(image);

    // Never a broken-image icon, blank gap, or browser default.
    expect(screen.getByTestId("wishlist-image-placeholder")).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("maps every stored desire level to its approved V18 chip string", () => {
    const cases = [
      ["really_want", "Really want"],
      ["would_love", "Would love"],
      ["just_an_idea", "Just an idea"],
    ] as const;
    for (const [level, label] of cases) {
      const { unmount } = render(
        <WishlistCard item={item({ desireLevel: level })} index={0} />,
      );
      expect(screen.getByText(label)).toBeVisible();
      unmount();
    }
  });
});

describe("WishlistCardGrid", () => {
  it("renders one card per item in the given (pinned read) order", () => {
    const items = [
      item(),
      item({
        id: "00000000-0000-4000-8000-000000000003",
        title: "The Overstory paperback",
        sourceUrl: null,
        retailer: "Fixture Books",
        note: null,
        desireLevel: "would_love",
        sortPosition: 2,
        originalAmountMinor: "132000",
        originalCurrency: "JPY",
      }),
      item({
        id: "00000000-0000-4000-8000-000000000004",
        title: "Mechanical keyboard keycaps",
        sourceUrl: null,
        retailer: null,
        note: "Just an idea for now, no link yet.",
        desireLevel: "just_an_idea",
        sortPosition: 3,
        originalAmountMinor: null,
        originalCurrency: null,
      }),
    ];
    render(<WishlistCardGrid items={items} />);

    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(3);
    expect(
      cards.map((card) => within(card).getByRole("heading").textContent),
    ).toEqual([
      "Ceramic pour-over coffee set",
      "The Overstory paperback",
      "Mechanical keyboard keycaps",
    ]);
    // The zero-decimal JPY item never shows fractional digits.
    expect(within(cards[1]).getByText("132000 JPY")).toBeVisible();
  });
});
