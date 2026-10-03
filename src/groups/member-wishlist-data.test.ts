import { describe, expect, it, vi } from "vitest";

// The data module is server-only; the unit suite exercises the pure parser
// in a Node environment (its client-bundle behaviour is proven by the
// production build).
vi.mock("server-only", () => ({}));

import { parseMemberWishlistSnapshot } from "./member-wishlist-data";

import type { MemberWishlistRow } from "./member-wishlist-data";

function row(overrides: Partial<MemberWishlistRow>): MemberWishlistRow {
  return {
    member_display_name: "Kabir Kaul",
    item_id: "bb1d0f2e-0000-4000-8000-000000000001",
    title: "Pour-over kettle",
    source_url: "https://shop.example.invalid/kettle",
    retailer: "Fixture Roasters",
    image_url: "https://img.example.invalid/kettle.jpg",
    note: "The 1 litre one.",
    desire_level: "really_want",
    original_amount_minor: 249900,
    original_currency: "INR",
    ...overrides,
  } as MemberWishlistRow;
}

describe("parseMemberWishlistSnapshot", () => {
  it("parses populated rows in the projection's committed order", () => {
    const snapshot = parseMemberWishlistSnapshot([
      row({}),
      row({
        item_id: "bb1d0f2e-0000-4000-8000-000000000002",
        title: "Mug",
        source_url: null,
        image_url: null,
        note: null,
        retailer: null,
        desire_level: "just_an_idea",
        original_amount_minor: null,
        original_currency: null,
      }),
    ]);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.memberDisplayName).toBe("Kabir Kaul");
    expect(snapshot?.items).toHaveLength(2);
    expect(snapshot?.items[0]?.itemId).toBe(
      "bb1d0f2e-0000-4000-8000-000000000001",
    );
    expect(snapshot?.items[0]?.originalAmountMinor).toBe("249900");
    expect(snapshot?.items[0]?.originalCurrency).toBe("INR");
    expect(snapshot?.items[1]?.sourceUrl).toBeNull();
    expect(snapshot?.items[1]?.imageUrl).toBeNull();
    expect(snapshot?.items[1]?.note).toBeNull();
    expect(snapshot?.items[1]?.originalAmountMinor).toBeNull();
  });

  it("maps the authorized-empty sentinel to an empty item list", () => {
    const snapshot = parseMemberWishlistSnapshot([
      row({
        item_id: null,
        title: null,
        source_url: null,
        retailer: null,
        image_url: null,
        note: null,
        desire_level: null,
        original_amount_minor: null,
        original_currency: null,
      }),
    ]);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.memberDisplayName).toBe("Kabir Kaul");
    expect(snapshot?.items).toHaveLength(0);
  });

  it("rejects zero rows (denial), mixed sentinels, and shape drift", () => {
    // Zero rows: denial, never an empty wishlist.
    expect(parseMemberWishlistSnapshot([])).toBeNull();
    expect(parseMemberWishlistSnapshot(null)).toBeNull();

    // A sentinel row mixed with items is a shape the application refuses.
    expect(
      parseMemberWishlistSnapshot([
        row({}),
        row({
          item_id: null,
          title: null,
          source_url: null,
          retailer: null,
          image_url: null,
          note: null,
          desire_level: null,
          original_amount_minor: null,
          original_currency: null,
        }),
      ]),
    ).toBeNull();

    // Two sentinel rows are ambiguous.
    expect(
      parseMemberWishlistSnapshot([
        row({
          item_id: null,
          title: null,
          source_url: null,
          retailer: null,
          image_url: null,
          note: null,
          desire_level: null,
          original_amount_minor: null,
          original_currency: null,
        }),
        row({
          item_id: null,
          title: null,
          source_url: null,
          retailer: null,
          image_url: null,
          note: null,
          desire_level: null,
          original_amount_minor: null,
          original_currency: null,
        }),
      ]),
    ).toBeNull();

    // A sentinel with a populated item field contradicts the shape.
    expect(
      parseMemberWishlistSnapshot([
        row({
          item_id: null,
          title: "Ghost item",
          source_url: null,
          retailer: null,
          image_url: null,
          note: null,
          desire_level: null,
          original_amount_minor: null,
          original_currency: null,
        }),
      ]),
    ).toBeNull();
  });

  it("rejects contradictory member labels and invalid fields", () => {
    expect(
      parseMemberWishlistSnapshot([
        row({}),
        row({ member_display_name: "Someone Else" }),
      ]),
    ).toBeNull();
    expect(
      parseMemberWishlistSnapshot([row({ member_display_name: null })]),
    ).toBeNull();
    expect(
      parseMemberWishlistSnapshot([row({ member_display_name: "" })]),
    ).toBeNull();
    expect(
      parseMemberWishlistSnapshot([row({ item_id: "not-a-uuid" })]),
    ).toBeNull();
    expect(parseMemberWishlistSnapshot([row({ title: "" })])).toBeNull();
    expect(
      parseMemberWishlistSnapshot([row({ desire_level: "sideways" })]),
    ).toBeNull();
    // Non-https image or source URLs are refused (never a storage path).
    expect(
      parseMemberWishlistSnapshot([
        row({ image_url: "wishlist-snapshots/x.webp" }),
      ]),
    ).toBeNull();
    expect(
      parseMemberWishlistSnapshot([row({ source_url: "javascript:alert(1)" })]),
    ).toBeNull();
  });

  it("rejects money-pair inconsistencies and non-integer amounts", () => {
    expect(
      parseMemberWishlistSnapshot([
        row({ original_amount_minor: 249900, original_currency: null }),
      ]),
    ).toBeNull();
    expect(
      parseMemberWishlistSnapshot([
        row({ original_amount_minor: null, original_currency: "INR" }),
      ]),
    ).toBeNull();
    expect(
      parseMemberWishlistSnapshot([
        row({ original_amount_minor: 24.5, original_currency: "INR" }),
      ]),
    ).toBeNull();
    expect(
      parseMemberWishlistSnapshot([
        row({ original_amount_minor: 249900, original_currency: "rupees" }),
      ]),
    ).toBeNull();
  });

  it("rejects duplicate item ids", () => {
    const sameId = "bb1d0f2e-0000-4000-8000-000000000001";
    expect(
      parseMemberWishlistSnapshot([row({}), row({ item_id: sameId })]),
    ).toBeNull();
  });
});
