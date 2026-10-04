import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
import {
  parseOwnShareState,
  parsePublicWishlist,
  parsePublicReaction,
  combineOwnerReactions,
} from "./public-share-data";
const token = "A".repeat(43);
const id = "12345678-1234-4123-8123-123456789012";
const row = {
  display_name: "Aanya",
  taste_line: "Tiny luxuries",
  vibe: "electric",
  viewer_is_owner: false,
  item_id: id,
  title: "Cup",
  source_url: "https://example.com/cup",
  retailer: "Shop",
  note: null,
  desire_level: "would_love",
  original_amount_minor: "245000",
  original_currency: "INR",
  has_image: true,
  very_you_count: 2,
  questionable_count: 0,
  want_it_too_count: 1,
  viewer_reaction: null,
};
describe("public wishlist projection boundary", () => {
  it("carries only approved fields and a guarded image route", () => {
    const result = parsePublicWishlist(
      [
        {
          ...row,
          email: "private",
          owner_id: id,
          group_id: id,
          reservation_status: "reserved",
          assignment: "secret",
          image_snapshot_path: "private/file.webp",
        },
      ],
      token,
    );
    expect(result?.items[0].imageUrl).toBe(`/s/${token}/images/${id}`);
    const json = JSON.stringify(result);
    for (const value of [
      "private",
      "group_id",
      "reservation",
      "assignment",
      "owner_id",
    ])
      expect(json).not.toContain(value);
    expect(result?.items[0].originalAmountMinor).toBe("245000");
  });
  it("distinguishes denied from authorized empty", () => {
    expect(parsePublicWishlist([], token)).toBeNull();
    const sentinel = { ...row };
    for (const key of Object.keys(sentinel).filter(
      (key) =>
        !["display_name", "taste_line", "vibe", "viewer_is_owner"].includes(
          key,
        ),
    ))
      (sentinel as Record<string, unknown>)[key] = null;
    expect(parsePublicWishlist([sentinel], token)?.items).toEqual([]);
    expect(parsePublicWishlist([sentinel, row], token)).toBeNull();
  });
  it.each([
    { display_name: "" },
    { vibe: "unknown" },
    { viewer_is_owner: "true" },
    { item_id: "bad" },
    { title: "" },
    { source_url: "javascript:alert(1)" },
    { source_url: "https://secret@example.com" },
    { original_amount_minor: 245000 },
    { original_amount_minor: "9223372036854775808" },
    { original_currency: null },
    { has_image: "true" },
    { very_you_count: -1 },
    { very_you_count: 1.2 },
    { viewer_reaction: "reserved" },
  ])("rejects malformed projection %j", (patch) =>
    expect(parsePublicWishlist([{ ...row, ...patch }], token)).toBeNull(),
  );
  it("rejects duplicates and contradictory profile headers", () => {
    expect(parsePublicWishlist([row, row], token)).toBeNull();
    expect(
      parsePublicWishlist([row, { ...row, display_name: "Other" }], token),
    ).toBeNull();
    expect(parsePublicWishlist([row], "not-a-token")).toBeNull();
  });
  it("rejects malformed reaction rows", () => {
    expect(parsePublicReaction({ ...row, very_you_count: NaN })).toBeNull();
    expect(
      parsePublicReaction({
        ...row,
        very_you_count: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toBeNull();
  });
  it("validates owner state and exact versions", () => {
    expect(
      parseOwnShareState([{ enabled: true, version: 0, share_token: token }]),
    ).toEqual({ enabled: true, version: "0", shareToken: token });
    expect(
      parseOwnShareState([{ enabled: false, version: 1, share_token: null }])
        ?.enabled,
    ).toBe(false);
    for (const state of [
      { enabled: false, version: 1, share_token: token },
      { enabled: true, version: 1, share_token: null },
      { enabled: true, version: -1, share_token: token },
    ])
      expect(parseOwnShareState([state])).toBeNull();
  });
  it("combines owner counts without exposing actor identities", () => {
    const counts = { veryYou: 1, questionable: 0, wantItToo: 2 };
    expect(
      combineOwnerReactions([{ itemId: id, counts }], [{ itemId: id, counts }]),
    ).toEqual([
      { itemId: id, counts: { veryYou: 2, questionable: 0, wantItToo: 4 } },
    ]);
  });
});
