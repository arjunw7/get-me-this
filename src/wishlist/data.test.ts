import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseServerClient } from "@/src/supabase/server";

import { getOwnWishlist } from "./data";
import type { WishlistItemRow } from "./display";

vi.mock("server-only", () => ({}));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

const WISHLIST_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const COLUMNS =
  "id,copied_from_item_id,title,source_url,retailer,image_url,image_snapshot_path,note,desire_level,sort_position,original_amount_minor::text,original_currency,converted_amount_minor::text,converted_currency,conversion_rate_source,conversion_rate_at,created_at,updated_at";

function rows(count: number): WishlistItemRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: `Item ${index}`,
    source_url: null,
    retailer: null,
    image_url: null,
    image_snapshot_path: null,
    note: null,
    desire_level: "would_love",
    sort_position: index === 499 || index === 500 ? 499 : index,
    original_amount_minor: index === 0 ? "9007199254740993" : null,
    original_currency: index === 0 ? "INR" : null,
    converted_amount_minor: null,
    converted_currency: null,
    conversion_rate_source: null,
    conversion_rate_at: null,
    created_at: "2026-09-30T00:00:00.000Z",
    updated_at: "2026-09-30T00:00:00.000Z",
  }));
}

function fixture(total: number, failingPage?: number, badAmount?: unknown) {
  const all = rows(total);
  if (badAmount !== undefined && all[0]) {
    all[0].original_amount_minor = badAmount as string;
  }
  const calls: Array<{
    select: string;
    wishlistId: string;
    orders: string[];
    range: [number, number];
  }> = [];
  const client = {
    from(table: string) {
      if (table === "wishlists") {
        return {
          select: (columns: string) => {
            expect(columns).toBe("id");
            return {
              eq: (field: string, value: string) => {
                expect([field, value]).toEqual(["owner_id", USER_ID]);
                return {
                  maybeSingle: async () => ({
                    data: { id: WISHLIST_ID },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }
      expect(table).toBe("wishlist_items");
      const call = {
        select: "",
        wishlistId: "",
        orders: [] as string[],
        range: [0, 0] as [number, number],
      };
      calls.push(call);
      const query = {
        select(columns: string) {
          call.select = columns;
          return query;
        },
        eq(field: string, value: string) {
          expect(field).toBe("wishlist_id");
          call.wishlistId = value;
          return query;
        },
        order(field: string, options: { ascending: boolean }) {
          call.orders.push(`${field}:${options.ascending}`);
          return query;
        },
        async range(start: number, end: number) {
          call.range = [start, end];
          if (calls.length === failingPage)
            return { data: null, error: { message: "page failed" } };
          return { data: all.slice(start, end + 1), error: null };
        },
      };
      return query;
    },
  };
  vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
  return { calls, all };
}

beforeEach(() => vi.clearAllMocks());

describe("getOwnWishlist paged owner read", () => {
  for (const [total, expectedRanges] of [
    [0, [[0, 499]]],
    [
      500,
      [
        [0, 499],
        [500, 999],
      ],
    ],
    [
      1000,
      [
        [0, 499],
        [500, 999],
        [1000, 1499],
      ],
    ],
    [
      1001,
      [
        [0, 499],
        [500, 999],
        [1000, 1499],
      ],
    ],
  ] as const) {
    it(`returns all ${total} ordered rows using bounded pages`, async () => {
      const { calls } = fixture(total);
      const result = await getOwnWishlist(USER_ID);
      expect(result?.wishlistId).toBe(WISHLIST_ID);
      expect(result?.items).toHaveLength(total);
      expect(result?.items.map((item) => item.title)).toEqual(
        rows(total).map((row) => row.title),
      );
      if (total > 0)
        expect(result?.items[0].originalAmountMinor).toBe("9007199254740993");
      expect(calls.map((call) => call.range)).toEqual(expectedRanges);
      for (const call of calls) {
        expect(call).toMatchObject({
          select: COLUMNS,
          wishlistId: WISHLIST_ID,
          orders: ["sort_position:true", "id:true"],
        });
      }
    });
  }

  it("returns no partial list when a later page fails", async () => {
    const { calls } = fixture(1001, 2);
    expect(await getOwnWishlist(USER_ID)).toBeNull();
    expect(calls.map((call) => call.range)).toEqual([
      [0, 499],
      [500, 999],
    ]);
  });

  it("fails closed when the cast unexpectedly returns a numeric JSON value", async () => {
    fixture(1, undefined, 9007199254740992);
    expect(await getOwnWishlist(USER_ID)).toBeNull();
  });

  it("fails closed when the amount/currency pair is inconsistent", async () => {
    const { all } = fixture(1);
    all[0].original_currency = null;
    expect(await getOwnWishlist(USER_ID)).toBeNull();
  });
});
