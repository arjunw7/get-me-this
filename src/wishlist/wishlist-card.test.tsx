// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type {
  ConvertedMoneyTuple,
  WishlistItemSnapshot,
  WishlistItemView,
} from "./display";
import { WishlistCard, WishlistCardGrid } from "./wishlist-card";

/**
 * The wishlist card (005b) and its approximate-conversion states (005g):
 * snapshot-field rendering, the branded missing-image placeholder
 * (including the runtime image-failure fallback), the linked/unlinked
 * retailer presentation, and the dormant-conversion display treatments —
 * original-only default, approximate line, stale tuple, and the fail-safe
 * degradations, with "approximately" in the accessible text. Since 005f the
 * card consumes the server-resolved client-safe view (`imageSrc`); the
 * snapshot-first fallback order itself is proven in item-views.test.ts.
 */

function item(overrides: Partial<WishlistItemView> = {}): WishlistItemView {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    title: "Ceramic pour-over coffee set",
    sourceUrl: "https://example.invalid/products/pour-over-set",
    retailer: "Fixture Roasters",
    imageSrc: null,
    note: "The matte one, not the glossy one.",
    desireLevel: "really_want",
    sortPosition: 1,
    originalAmountMinor: "249900",
    originalCurrency: "INR",
    converted: null,
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

/** A complete stored converted tuple: 24.99 INR ≈ 29.99 USD. */
function convertedTuple(
  overrides: Partial<ConvertedMoneyTuple> = {},
): ConvertedMoneyTuple {
  return {
    amountMinor: "2999",
    currency: "USD",
    rateSource: "fixture-provider quote fx-1",
    rateAt: "2026-10-01T12:00:00.000Z",
    stale: false,
    ...overrides,
  };
}

describe("WishlistCard", () => {
  it("keeps an unsupported stored currency opaque with an unavailable-price explanation", () => {
    render(
      <WishlistCard
        item={item({
          originalAmountMinor: "9007199254740993",
          originalCurrency: "ZZZ",
        })}
        index={0}
      />,
    );
    expect(
      screen.getByText("9007199254740993 ZZZ — price display unavailable"),
    ).toBeVisible();
  });

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
    expect(
      screen.getByRole("link", { name: "Edit Ceramic pour-over coffee set" }),
    ).toHaveAttribute(
      "href",
      "/wishlist/items/00000000-0000-4000-8000-000000000002/edit",
    );
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

  it("renders the server-resolved signed snapshot URL when one exists (005f snapshot-first)", () => {
    render(
      <WishlistCard
        item={item({
          imageSrc:
            "https://example.invalid/storage/wishlist-item-snapshots/signed",
        })}
        index={0}
      />,
    );

    const image = screen.getByRole("img", {
      name: "Ceramic pour-over coffee set",
    });
    expect(image).toHaveAttribute(
      "src",
      "https://example.invalid/storage/wishlist-item-snapshots/signed",
    );
    expect(screen.queryByTestId("wishlist-image-placeholder")).toBeNull();
  });

  it("falls back to the remote image URL when no signed snapshot URL exists", () => {
    render(
      <WishlistCard
        item={item({
          imageSrc: "https://example.invalid/images/pour-over.jpg",
        })}
        index={0}
      />,
    );

    expect(
      screen
        .getByRole("img", { name: "Ceramic pour-over coffee set" })
        .getAttribute("src"),
    ).toBe("https://example.invalid/images/pour-over.jpg");
  });

  it("degrades a runtime image failure to the branded placeholder", () => {
    render(
      <WishlistCard
        item={item({ imageSrc: "http://127.0.0.1:59999/broken.jpg" })}
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

describe("WishlistCard approximate-conversion states (005g, dormant)", () => {
  function renderCard(overrides: Partial<WishlistItemSnapshot> = {}) {
    return render(<WishlistCard item={item(overrides)} index={0} />);
  }

  it("shows the original price only when no conversion exists — the default dormant state", () => {
    renderCard();
    expect(screen.getByText("2499.00 INR")).toBeVisible();
    expect(screen.queryByTestId("approximate-price-line")).toBeNull();
    expect(screen.queryByText(/≈/)).toBeNull();
    expect(screen.queryByText(/approximately/i)).toBeNull();
  });

  it("renders the approximate line below the original for a complete supported tuple", () => {
    renderCard({ originalAmountMinor: "2499", converted: convertedTuple() });
    expect(screen.getByText("24.99 INR")).toBeVisible();
    expect(screen.getByTestId("approximate-price-line")).toHaveTextContent(
      "≈ 29.99 USD · fixture-provider quote fx-1 · captured 2026-10-01",
    );
  });

  it("carries 'approximately', amount, code, rate source, and captured date in the accessible text", () => {
    renderCard({ originalAmountMinor: "2499", converted: convertedTuple() });
    expect(
      screen.getByText(
        "Approximately 29.99 USD — rate source fixture-provider quote fx-1, captured 2026-10-01.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the original line before the approximate line in reading order", () => {
    const { container } = renderCard({
      originalAmountMinor: "2499",
      converted: convertedTuple(),
    });
    const original = screen.getByText("24.99 INR");
    const approximate = screen.getByTestId("approximate-price-line");
    expect(
      original.compareDocumentPosition(approximate) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.querySelector("article")).toContainElement(approximate);
  });

  it("renders a stale tuple as the identical line with its older captured date", () => {
    renderCard({
      originalAmountMinor: "2499",
      converted: convertedTuple({ rateAt: "2026-08-01T00:00:00.000Z" }),
    });
    expect(screen.getByTestId("approximate-price-line")).toHaveTextContent(
      "≈ 29.99 USD · fixture-provider quote fx-1 · captured 2026-08-01",
    );
    expect(screen.getByText("24.99 INR")).toBeVisible();
  });

  it("omits the approximate line and shows the original for an unsupported converted code", () => {
    renderCard({
      originalAmountMinor: "2499",
      converted: convertedTuple({ currency: "XYZ" }),
    });
    expect(screen.getByText("24.99 INR")).toBeVisible();
    expect(screen.queryByTestId("approximate-price-line")).toBeNull();
  });

  it("omits the approximate line and shows the original for a malformed converted amount", () => {
    renderCard({
      originalAmountMinor: "2499",
      converted: convertedTuple({ amountMinor: "12.5" }),
    });
    expect(screen.getByText("24.99 INR")).toBeVisible();
    expect(screen.queryByTestId("approximate-price-line")).toBeNull();
  });

  it("omits the approximate line for an item with no stored original price", () => {
    renderCard({
      originalAmountMinor: null,
      originalCurrency: null,
      converted: convertedTuple(),
    });
    expect(screen.queryByTestId("approximate-price-line")).toBeNull();
    expect(screen.queryByText(/≈/)).toBeNull();
  });

  it("marks approximately with text, never color alone", () => {
    renderCard({ originalAmountMinor: "2499", converted: convertedTuple() });
    const line = screen.getByTestId("approximate-price-line");
    // The textual marker and detail are present as content, not styling.
    expect(line).toHaveTextContent("≈");
    expect(line).toHaveTextContent("captured 2026-10-01");
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
